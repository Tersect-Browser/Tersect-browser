# file: scripts/introgression_scan_all.py
import argparse, sys, re, math, json
import numpy as np, pandas as pd
from ete3 import Tree
from scipy.stats import mannwhitneyu, chisquare
from statsmodels.stats.multitest import multipletests

# ---------- helpers ----------

def load_newick(path):
    with open(path) as fh:
        # strip comments like [S=...] that sometimes appear in ASTRAL/gene trees
        return re.sub(r"\[[^\]]*\]", "", fh.read().strip())

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

def jackknife_diff_means(group_a, group_b):
    """Return (delta, se_delta) for delta = mean(A) - mean(B) via leave-one-out jackknife."""
    a = np.asarray(group_a, dtype=float)
    b = np.asarray(group_b, dtype=float)
    if len(a) == 0 or len(b) == 0:
        return (float("nan"), float("inf"))
    delta = float(np.mean(a) - np.mean(b))
    m = len(a) + len(b)
    if m < 2:
        return (delta, float("inf"))
    jk_vals = []
    for i in range(len(a)):
        a_loo = np.delete(a, i)
        if len(a_loo) > 0:
            jk_vals.append(float(np.mean(a_loo) - np.mean(b)))
    for j in range(len(b)):
        b_loo = np.delete(b, j)
        if len(b_loo) > 0:
            jk_vals.append(float(np.mean(a) - np.mean(b_loo)))
    jk_vals = np.asarray(jk_vals, dtype=float)
    if len(jk_vals) == 0:
        return (delta, float("inf"))
    jk_mean = float(np.mean(jk_vals))
    se = math.sqrt((len(jk_vals)-1)/len(jk_vals) * float(np.sum((jk_vals - jk_mean)**2)))
    return (delta, se)

def infer_sister_pair_from_quartet(tree, trio, outgroup):
    a, b, c = trio
    for x, y, other in ((a,b,c), (a,c,b), (b,c,a)):
        ca = tree.get_common_ancestor(x, y)
        if other not in set(leaf.name for leaf in ca.get_leaves()):
            return x, y
    raise ValueError("Unresolved trio (polytomy?) in pruned tree.")

def label_topology_quartet(gt_q, p1, p2, p3, outgroup):
    """Return 'T1','T2','T3' or 'ERROR' via structure-only logic."""
    try:
        lca_12 = gt_q.get_common_ancestor([p1, p2])
        lca_13 = gt_q.get_common_ancestor([p1, p3])
        lca_23 = gt_q.get_common_ancestor([p2, p3])
    except Exception:
        return "ERROR"
    leaves_12 = {lf.name for lf in lca_12.get_leaves()}
    leaves_13 = {lf.name for lf in lca_13.get_leaves()}
    leaves_23 = {lf.name for lf in lca_23.get_leaves()}
    if outgroup not in leaves_12 and leaves_12 == {p1, p2}: return "T1"
    if outgroup not in leaves_13 and leaves_13 == {p1, p3}: return "T2"
    if outgroup not in leaves_23 and leaves_23 == {p2, p3}: return "T3"
    return "ERROR"

def avg_ext_branch(gt_q, taxon_a, taxon_b):
    """
    Return the average of external branch lengths for the sister pair (a, b)
    in the pruned quartet tree.
    """
    try:
        leaf_a = gt_q & taxon_a
        leaf_b = gt_q & taxon_b
        return (leaf_a.dist + leaf_b.dist) / 2.0
    except Exception:
        return None

# ---------- main ----------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--windows-csv", required=True)
    p.add_argument("--species-tree", required=True)          # Newick
    p.add_argument("--ingroup", nargs=3, required=True, metavar=("P1","P2","P3"))
    p.add_argument("--out-json")                             # optional
    p.add_argument("--block-size", type=int, default=50)
    p.add_argument("--outgroup", required=True)
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    B = args.block_size

    # --- Load windows mapping ---
    mapping_df = pd.read_csv(args.windows_csv).sort_values("start", ignore_index=True)
    mapping_df["mid_bp"] = (mapping_df["start"] + mapping_df["end"])

    # --- Species tree, quartet order ---
    sp = Tree(load_newick(args.species_tree), format=1)
    leafs = {t.name for t in sp.iter_leaves()}
    need = set(args.ingroup) | {args.outgroup}
    missing = need - leafs
    if missing:
        raise SystemExit(f"Missing in species tree: {sorted(missing)}")
    sp.set_outgroup(sp.search_nodes(name=args.outgroup)[0])

    quartet = [*args.ingroup, args.outgroup]
    sp_q = sp.copy(method="deepcopy")
    sp_q.prune(quartet, preserve_branch_length=True)

    try:
        p1, p2 = infer_sister_pair_from_quartet(sp_q, args.ingroup, args.outgroup)
    except ValueError as e:
        raise SystemExit(str(e))
    p3 = next(t for t in args.ingroup if t not in (p1, p2))
    taxa = [p1, p2, p3]

    # Try to read τ from species tree; if absent, estimate via MoM from genome-wide discordance (like your original)
    try:
        ca_sp = sp.get_common_ancestor(p1, p2)
        tau_species = float(ca_sp.dist) if ca_sp.dist is not None else float("nan")
        if not (math.isfinite(tau_species) and tau_species > 0):
            tau_species = float("nan")
    except Exception:
        tau_species = float("nan")

    # --- Load gene trees and build per-tree records as in ---
    def load_tree(path):
        with open(path) as fh:
            return Tree(re.sub(r"\[[^\]]*\]", "", fh.read().strip()), format=1)

    gene_trees = []
    for pth in mapping_df["tree"]:
        try:
            gene_trees.append(load_tree(pth))
        except Exception:
            gene_trees.append(None)

    per_tree = []   # list of (topo, d) where d is the pairwise distance matching the topology
    total_n = total_n2 = total_n3 = 0

    for gt in gene_trees:
        if gt is None:
            continue
        try:
            gt.set_outgroup(gt.search_nodes(name=args.outgroup)[0])
            gt_q = gt.copy(method="deepcopy")
            gt_q.prune([p1, p2, p3, args.outgroup], preserve_branch_length=True)

            topo = label_topology_quartet(gt_q, p1, p2, p3, args.outgroup)

            # distance for the *sister pair of that topology* (logic)
            d = None
            external_d = None
            if topo == "T1":
                d = float(gt_q.get_distance(p1, p2))
                leaf1 = gt_q & p1
                leaf2 = gt_q & p2
                mrca = gt_q.get_common_ancestor(leaf1, leaf2)
                d1 = gt_q.get_distance(mrca, leaf1)
                d2 = gt_q.get_distance(mrca, leaf2)
                external_d = (d1 + d2) / 2.0

                total_n += 1
            elif topo == "T2":
                d = float(gt_q.get_distance(p1, p3))
                leaf1 = gt_q & p1
                leaf2 = gt_q & p3
                mrca = gt_q.get_common_ancestor(leaf1, leaf2)
                d1 = gt_q.get_distance(mrca, leaf1)
                d2 = gt_q.get_distance(mrca, leaf2)
                external_d = (d1 + d2) / 2.0
                total_n += 1; total_n2 += 1
            elif topo == "T3":
                d = float(gt_q.get_distance(p2, p3))
                total_n += 1; total_n3 += 1
                leaf1 = gt_q & p2
                leaf2 = gt_q & p3
                mrca = gt_q.get_common_ancestor(leaf1, leaf2)
                d1 = gt_q.get_distance(mrca, leaf1)
                d2 = gt_q.get_distance(mrca, leaf2)
                external_d = (d1 + d2) / 2.0

            if d is not None and np.isfinite(d) and d > 0:
                per_tree.append((topo, float(d), float(external_d) if external_d is not None and np.isfinite(external_d) and external_d > 0 else None))
        except Exception:
            continue

    # ---- Global tau_hat (exactly like your original) ----
    if math.isfinite(tau_species) and tau_species > 0:
        tau_hat_global = tau_species
    else:
        # Fallback: method-of-moments from genome-wide discordant fraction
        f_disc = (total_n2 + total_n3) / max(1, total_n)
        eps = 1e-9
        f_disc = max(eps, min(2.0 / 3.0 - eps, f_disc))  # constrain to avoid log problems
        tau_hat_global = float(-math.log((3.0 / 2.0) * f_disc))

    p_disc_expected = 2.0 * math.exp(-tau_hat_global) / 3.0  # constant across blocks

    # --- Block aggregation: compute DCT, BLT, and hybrid ---
    records = []
    # We index blocks by *per_tree* order so it matches slice-by-B behavior
    # But we also need the midpoints: map per_tree indices back to mapping_df rows 1:1


    for start_idx in range(0, len(per_tree), B):
        trees = per_tree[start_idx:start_idx + B]

        mid = float(mapping_df["mid_bp"].iloc[start_idx:start_idx + B].mean())

        # ------ per-block logic ------
        n1 = n2 = n3 = 0
        d_T1, d_T2, d_T3 = [], [], []
        d_ET1,d_ET2, d_ET3 = [], [], []
        total_evolutionary_distance = 0.0
        discordant_distance = 0.0

        for topo, d, e in trees:
            if d is None or d <= 0:
                continue
            total_evolutionary_distance += d
            if topo == "T1":
                d_T1.append(d); n1 += 1
                d_ET1.append(e)
            elif topo == "T2":
                d_T2.append(d); n2 += 1; discordant_distance += d
                d_ET2.append(e)
            elif topo == "T3":
                d_T3.append(d); n3 += 1; discordant_distance += d
                d_ET3.append(e)

        all_distances = d_T1 + d_T2 + d_T3
        discordant_distances = d_T2 + d_T3
        if len(all_distances) == 0:
            # nothing valid in this block
            continue

        mean_total, _ = jackknife_mean(all_distances)
        mean_discordant, _ = jackknife_mean(discordant_distances) if discordant_distances else (0.0, float("inf"))
        obs_disc = (mean_discordant / mean_total) if mean_total > 0 else 0.0
        mean_T2, _ = jackknife_mean(d_T2)
        mean_T3, _ = jackknife_mean(d_T3)
        asymmetry_score = (mean_T2 - mean_T3) / (mean_T2 + mean_T3) if (mean_T2 + mean_T3) > 0 else 1


        # ------ DCT for this block (counts-based, independent of hybrid) ------
        n_disc = n2 + n3
        n_tot  = n1 + n_disc
        n_disc = n2 + n3
        # DCT χ² on T2 vs T3 (expected 50:50 under ILS)
        p_sym = float(chisquare(f_obs=[n2, n3],
                                f_exp=[n_disc/2.0, n_disc/2.0]).pvalue) if n_disc > 0 else 1.0


        # ------ BLT for this block (distance-based, independent of hybrid) ------
        if len(d_ET2) > 0 and len(d_ET3) > 0:
            # two-sided matches their wording; if you expect a specific direction (e.g., T2 shorter), use alternative="less"
            U, p_blt = mannwhitneyu(d_ET2, d_ET3, alternative="less")
        else:
            p_blt = 1.0



        records.append({
            "start_idx": int(start_idx),
            "mid_BP": mid,

            # Hybrid/original outputs
            "tau_hat": float(tau_hat_global),
            "obs_disc_frac": float(obs_disc),
            "exp_disc_frac": float(p_disc_expected),
            "asymmetry_score": float(asymmetry_score),

            # Counts/distances for transparency
            "n_T1": int(n1), "n_T2": int(n2), "n_T3": int(n3),
            "n_total": int(n_tot),
            "mean_T2": float(mean_T2) if math.isfinite(mean_T2) else None,
            "mean_T3": float(mean_T3) if math.isfinite(mean_T3) else None,

            # DCT/BLT p-values
            # Low p_blt (< 0.05 after FDR correction) → reject null → there is a significant difference → possible introgression.
            # High p_blt (≥ 0.05 after FDR correction) → fail to reject null → no significant difference → no introgression.
            "delta": float(p_blt) if math.isfinite(p_blt) else None,
            "p_sym": float(p_sym),
            "p_blt": float(p_blt),

        })

    # FDR (separate families for DCT symmetry, DCT total, BLT)
    dfb = pd.DataFrame(records)
    print("Starting FDR correction")
    dfb["p_sym_fdr"] = multipletests(dfb["p_sym"].fillna(1.0), method="fdr_bh")[1]
    dfb["sig_sym"]   = (dfb["p_sym_fdr"] <0.05)   # FDR cutoff = 0.05
    dfb["p_blt_fdr"]   = multipletests(dfb["p_blt"].fillna(1.0), method='fdr_bh')[1]
    dfb["sig_blt"]     = (dfb["p_blt_fdr"] < 0.05)

    payload = {
        "params": {
            "block_size": B,
            "outgroup": args.outgroup,
            "taxa": taxa,
            "uses_tau_for_total_test": True,            # we always have tau_hat_global (species tau or MoM)
        },
        "global": {
            "methods": ["HYBRID", "DCT", "BLT"],
            "notes": "Hybrid/mode uses ONLY obs_disc vs global expectation and asymmetry_score. DCT/BLT are computed independently."
        },
        "blocks": dfb.replace({np.nan: None}).to_dict(orient="records")
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
