# file: scripts/introgression_scan.py
import argparse, os, sys, re, math, json
import numpy as np, pandas as pd
from ete3 import Tree
from scipy.stats import norm
from statsmodels.stats.multitest import multipletests

# ---------- helpers ----------

def jackknife_mean(arr):
    """Return (mean, jackknife SE of mean)."""
    x = np.asarray(arr, dtype=float)
    n = len(x)
    if n < 2:
        m = float(np.mean(x)) if n > 0 else 0.0
        return m, float("inf")
    jk = [float(np.mean(np.delete(x, i))) for i in range(n)]
    jk_mean = float(np.mean(jk))
    se = math.sqrt((n - 1) / n * float(np.sum((np.array(jk) - jk_mean) ** 2)))
    return float(np.mean(x)), se

def load_newick(path):
    with open(path) as fh:
        # strip comments like [S=...] that sometimes appear in ASTRAL/gene trees
        return re.sub(r"\[[^\]]*\]", "", fh.read().strip())


def infer_sister_pair_from_quartet(tree, trio, outgroup):
    a, b, c = trio
    for x, y, other in ((a,b,c), (a,c,b), (b,c,a)):
        ca = tree.get_common_ancestor(x, y)
        # Among the pruned quartet, the sister pair’s MRCA will NOT contain the third ingroup
        if other not in set(ca.get_leaf_names()):
            return x, y
    raise ValueError("Unresolved trio (polytomy?) in pruned tree.")


def label_topology_quartet(gt_q, p1, p2, p3, outgroup, min_distance=0.005):
    """
    Correct quartet topology determination using all four taxa with discordant distance filtering.
    Based on Hibbins & Hahn (2022) Genetics and standard quartet analysis.

    Parameters:
    - gt_q: pruned gene tree with quartet taxa
    - p1, p2, p3: ingroup taxa names
    - outgroup: outgroup taxon name
    - min_distance: minimum distance threshold for discordant topologies (T2/T3)

    Returns:
    - T1: Species tree topology (p1,p2) are sisters OR discordant distance below threshold
    - T2: (p1,p3) are sisters (first discordant topology) with distance >= min_distance
    - T3: (p2,p3) are sisters (second discordant topology) with distance >= min_distance
    - ERROR: if calculation fails
    """

    # Method 1: Tree structure approach (most reliable)
    preliminary_topology = None
    try:
        # Check which ingroup pair forms a clade excluding the outgroup
        lca_12 = gt_q.get_common_ancestor([p1, p2])
        lca_13 = gt_q.get_common_ancestor([p1, p3])
        lca_23 = gt_q.get_common_ancestor([p2, p3])

        # Get all leaves under each LCA
        leaves_12 = set([leaf.name for leaf in lca_12.get_leaves()])
        leaves_13 = set([leaf.name for leaf in lca_13.get_leaves()])
        leaves_23 = set([leaf.name for leaf in lca_23.get_leaves()])

        # The correct sister pair should NOT include the outgroup in their LCA
        if outgroup not in leaves_12 and leaves_12 == {p1, p2}:
            preliminary_topology = "T1"  # (p1,p2) are sisters - species tree topology
        elif outgroup not in leaves_13 and leaves_13 == {p1, p3}:
            preliminary_topology = "T2"  # (p1,p3) are sisters - first discordant topology
        elif outgroup not in leaves_23 and leaves_23 == {p2, p3}:
            preliminary_topology = "T3"  # (p2,p3) are sisters - second discordant topology

    except Exception as e:
        print(f"Tree structure method failed: {e}")

    # Method 2: Quartet distance method (fallback if structure method failed)
    if preliminary_topology is None:
        try:
            # Calculate all six pairwise distances
            d12 = gt_q.get_distance(p1, p2)
            d13 = gt_q.get_distance(p1, p3)
            d14 = gt_q.get_distance(p1, outgroup)
            d23 = gt_q.get_distance(p2, p3)
            d24 = gt_q.get_distance(p2, outgroup)
            d34 = gt_q.get_distance(p3, outgroup)

            # Standard quartet analysis: compare sums of opposite pairs
            sum_T1 = d12 + d34  # Species tree topology
            sum_T2 = d13 + d24  # First discordant topology
            sum_T3 = d23 + d14  # Second discordant topology

            # The topology with the SMALLEST sum is the correct one
            min_sum = min(sum_T1, sum_T2, sum_T3)

            if min_sum == sum_T1:
                preliminary_topology = "T1"
            elif min_sum == sum_T2:
                preliminary_topology = "T2"
            else:
                preliminary_topology = "T3"

        except Exception as e:
            print(f"Distance method failed: {e}")
            return "ERROR"

    # Now apply distance filtering for discordant topologies
    if preliminary_topology == "T1":
        # T1 (concordant) - no distance filtering needed
        return "T1"

    elif preliminary_topology == "T2":
        # T2: (p1,p3) are sisters - check their distance
        try:
            discordant_distance = gt_q.get_distance(p1, p3)
            if discordant_distance >= min_distance:
                return "T2"
            else:
                # Distance too small, treat as T1 (concordant)
                return "T1"
        except Exception as e:
            print(f"Failed to calculate T2 distance: {e}")
            return "ERROR"

    elif preliminary_topology == "T3":
        # T3: (p2,p3) are sisters - check their distance
        try:
            discordant_distance = gt_q.get_distance(p2, p3)
            if discordant_distance >= min_distance:
                return "T3"
            else:
                # Distance too small, treat as T1 (concordant)
                return "T1"
        except Exception as e:
            print(f"Failed to calculate T3 distance: {e}")
            return "ERROR"

    else:
        return "ERROR"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--windows-csv", required=True)
    p.add_argument("--species-tree", required=True)   # a single Newick from ASTRAL
    p.add_argument("--ingroup", nargs=3, required=True, metavar=("P1","P2","P3"))
    p.add_argument("--out-json")                      # optional; if omitted, print to stdout
    p.add_argument("--block-size", type=int, default=50)
    p.add_argument("--outgroup", required=True)       # taxon name for rooting
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    B = args.block_size

    # --- Load mapping/paths ---
    mapping_df = pd.read_csv(args.windows_csv).sort_values("start", ignore_index=True)
    mapping_df["mid_bp"] = (mapping_df["start"] + mapping_df["end"]) / 2

    # --- Load species tree, root, and identify ingroup sister pair ---
    sp = Tree(load_newick(args.species_tree), format=1)
    leafs = {t.name for t in sp.iter_leaves()}
    need = set(args.ingroup) | {args.outgroup}
    missing = need - leafs
    if missing:
        raise SystemExit(f"Missing in species tree: {sorted(missing)}", need, leafs)
    sp.set_outgroup(sp.search_nodes(name=args.outgroup)[0])
    quartet = [*args.ingroup, args.outgroup]
    sp_q = sp.copy(method="deepcopy")
    sp_q.prune(quartet, preserve_branch_length=True)
    print(f"Pruned quartet tree: {sp_q.get_ascii(show_internal=True)}", sp)
    # Identify species-tree sister pair and order taxa as (p1,p2 are sisters, p3 is the third)
    try:
        p1, p2 = infer_sister_pair_from_quartet(sp_q, args.ingroup, args.outgroup)
    except ValueError as e:
        raise SystemExit(str(e))
    p3 = next(t for t in args.ingroup if t not in (p1, p2))
    taxa = [p1, p2, p3]  # record the explicit order used for T1/T2/T3

    # Species-tree internal branch length (coalescent units if available)
    ca_sp = sp.get_common_ancestor(p1, p2)
    tau_species = float(ca_sp.dist) if ca_sp.dist is not None else float("nan")
    if not (math.isfinite(tau_species) and tau_species > 0):
        tau_species = float("nan")  # will estimate from genome-wide discordance below

    # --- Load gene trees ---
    def load_tree(path):
        with open(path) as fh:
            return Tree(re.sub(r"\[[^\]]*\]", "", fh.read().strip()), format=1)

    gene_trees = [load_tree(pth) for pth in mapping_df["tree"]]
    gene_start_locations = mapping_df["start"].tolist()

    # --- First pass over all gene trees to label topologies and distances ---
    # Store per-tree info so we can (i) estimate tau if needed and (ii) aggregate into blocks.
    per_tree = []
    total_n = 0
    total_n2 = 0
    total_n3 = 0

    for i, gt in enumerate(gene_trees):
        start_idx = gene_start_locations[i]
        # root gene tree at the outgroup; will raise KeyError if taxa missing
        gt.set_outgroup(gt.search_nodes(name=args.outgroup)[0])
        quartet = [p1, p2, p3, args.outgroup]
        gt_q = gt.copy(method="deepcopy")
        gt_q.prune(quartet, preserve_branch_length=True)

        bl = [n.dist for n in gt_q.traverse() if n.dist is not None]
        if not bl or max(bl) == 0.0:
            print("Warning: zero/absent branch lengths in this window", file=sys.stderr)

        filtered_count = 0
        error_count = 0
        topo = label_topology_quartet(gt_q, p1, p2, p3, args.outgroup, min_distance=0.005)
        # Handle the filtered cases:
        if topo == "FILTERED_LOW_DISTANCE":
            filtered_count += 1
            continue  # Skip this tree
        elif topo == "ERROR":
            error_count += 1
            continue  # Skip this tree
        d = float(gt_q.get_distance(p1, p2))
        print("initial distance:", d)
        if topo == "T2":
            d = float(gt_q.get_distance(p1, p3))
            print(f"Gene tree {gt}: T2, d={d}", p1, p3, 'start_idx:', start_idx)
        elif topo == "T3":
            d = float(gt_q.get_distance(p2, p3))
            print(f"Gene tree {gt}: T3, d={d}", p2, 'start_idx:', start_idx)

        per_tree.append((topo, d))
        total_n += 1
        if topo == "T2": total_n2 += 1
        if topo == "T3": total_n3 += 1

    # --- Determine tau (and thus expected discordance) ---
    if math.isfinite(tau_species) and tau_species > 0:
        print(f"Using species-tree tau: {tau_species} coalescent units", file=sys.stderr)
        tau_hat_global = tau_species  # prefer ASTRAL's coalescent-unit internal branch
    else:
        # Fallback: method-of-moments from genome-wide discordant fraction TODO: implement
        f_disc = (total_n2 + total_n3) / max(1, total_n)
        # constrain to (0, 2/3) to avoid log problems
        eps = 1e-9
        f_disc = max(eps, min(2.0 / 3.0 - eps, f_disc))
        tau_hat_global = float(-math.log((3.0 / 2.0) * f_disc))

    p_disc_expected = 2.0 * math.exp(-tau_hat_global) / 3.0

    # --- Block aggregation with jackknife-based per-block tests ---
    records = []
    for start_idx in range(0, len(per_tree), B):
        trees = per_tree[start_idx:start_idx + B]
        mid = float(mapping_df["mid_bp"].iloc[start_idx:start_idx + B].mean())

        # counts and per-tree indicators
        n1 = n2 = n3 = 0
        valid_trees = 0
        d_T1, d_T2, d_T3 = [], [], []
        total_evolutionary_distance = 0.0
        concordant_distance = 0.0
        discordant_distance = 0.0
        for topo, d in trees:
            print(f"Processing Tree {start_idx}: {topo}, d={d}")
            if d is None or d <= 0:
                continue
            valid_trees += 1
            total_evolutionary_distance += d
            if topo == "T1":
                concordant_distance += d
                d_T1.append(d)
                n1 += 1
            elif topo == "T2":
                discordant_distance += d
                n2 += 1
                d_T2.append(d)
            elif topo == "T3":
                discordant_distance += d
                n3 += 1
                d_T3.append(d)

        all_distances = d_T1 + d_T2 + d_T3
        discordant_distances = d_T2 + d_T3
        if len(all_distances) == 0:
            continue
        mean_total, _ = jackknife_mean(all_distances)
        mean_discordant, _ = jackknife_mean(discordant_distances) if discordant_distances else (0.0, float("inf"))
        print(f"Block {start_idx} ({len(trees)} trees): T1={n1}, T2={n2}, T3={n3}, discordant_distance={discordant_distance} total_evolutionary_distance={total_evolutionary_distance}")
        obs_disc = mean_discordant / mean_total if mean_total > 0 else 0.0

        if len(d_T2) > 0 and len(d_T3) > 0:
            mean_T2, _ = jackknife_mean(d_T2)
            mean_T3, _ = jackknife_mean(d_T3)
            asymmetry_score = (mean_T2 - mean_T3) / (mean_T2 + mean_T3)
        elif len(d_T2) > 0:
            asymmetry_score = 1.0  # Only T2 present
        elif len(d_T3) > 0:
            asymmetry_score = -1.0  # Only T3 present
        else:
            asymmetry_score = 0.0  # No discordant trees

        n = max(1, n1 + n2 + n3)

        p_tot = 1.0



        mode = ""

        if obs_disc < p_disc_expected:
            if asymmetry_score is not None and asymmetry_score < 0.05:
                mode = "sister_introgression_with_asymmetry"  # Unusual pattern
            else:
                mode = "sister_introgression"
        else:
            if asymmetry_score is not None and asymmetry_score < 0.05:
                mode = "nonsister_introgression"  # Clear introgression signal
            else:
                mode = "excess_ILS_or_other"

        records.append({
            'start_idx': int(start_idx),
            'mid_BP': float(mid),
            'tau_hat': float(tau_hat_global),           # now species-tree (or MoM fallback), constant across blocks
            'obs_disc_frac': float(obs_disc),
            'exp_disc_frac': float(p_disc_expected),
            'mode': mode,
            'p_symmetry': float(asymmetry_score) if asymmetry_score is not None else None,
            'p_total': float(p_tot),
            'n_trees': int(n),
            'count_T2': int(n2),
            'count_T3': int(n3),
        })

    dfb = pd.DataFrame(records)

    # FDR across blocks (fill NA symmetry p-values with 1)
    dfb['p_total_fdr'] = multipletests(dfb['p_total'], method='fdr_bh')[1]
    dfb['p_sym_fdr']   = multipletests(dfb['p_symmetry'].fillna(1.0), method='fdr_bh')[1]
    dfb['sig_total']   = (dfb['p_total_fdr'] < args.alpha)
    dfb['sig_sym']     = (dfb['p_sym_fdr'] < args.alpha)


    # Prepare JSON-safe payload
    blocks_json = dfb.replace({np.nan: None}).to_dict(orient='records')
    # TODO: global statistics
    payload = {
        "params": {
            "block_size": B,
            "outgroup": args.outgroup,
            "taxa": taxa,
        },
        "global": {
            "jackknife_mean_diff": 0.0,
            "jackknife_se":0.0,
            "z_global": 0.0,
            "p_global": 0.0,
        },
        "blocks": blocks_json,
    }

    text = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    if args.out_json:
        with open(args.out_json, "w") as fh:
            fh.write(text)
    else:
        print(text)
    return 0

if __name__ == "__main__":
    sys.exit(main())
