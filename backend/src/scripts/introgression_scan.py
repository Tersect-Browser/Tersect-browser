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

def jackknife_mean_diff(obs, exp):
    """Global delete-one-block jackknife for mean(obs - exp)."""
    diffs = np.asarray(obs, dtype=float) - np.asarray(exp, dtype=float)
    n = len(diffs)
    if n < 2:
        return float(np.mean(diffs)), float("inf")
    jk_means = [float(np.mean(np.delete(diffs, i))) for i in range(n)]
    jk_mean = float(np.mean(jk_means))
    se = math.sqrt((n - 1) / n * float(np.sum((np.array(jk_means) - jk_mean) ** 2)))
    return jk_mean, se

def load_newick(path):
    with open(path) as fh:
        # strip comments like [S=...] that sometimes appear in ASTRAL/gene trees
        return re.sub(r"\[[^\]]*\]", "", fh.read().strip())

def is_strict_pair_clade(tree, a, b):
    """True if MRCA(a,b) subtends exactly {a,b} (no third ingroup taxon under it)."""
    ca = tree.get_common_ancestor(a, b)
    return set(ca.get_leaf_names()) == {a, b}

def infer_sister_pair(sp, ingroup):
    """Find which ingroup pair is sister on the species tree (rooted at outgroup)."""
    a, b, c = ingroup
    for p in [(a, b), (a, c), (b, c)]:
        if is_strict_pair_clade(sp, *p):
            return p
    raise ValueError("Could not identify a strict sister ingroup pair on the species tree.")

def label_topology_by_splits(gt, p1, p2, p3):
    """Return T1/T2/T3 by **clade membership** (T1 is the species-tree sister pair p1,p2)."""
    if is_strict_pair_clade(gt, p1, p2):
        return "T1"
    if is_strict_pair_clade(gt, p1, p3):
        return "T2"
    if is_strict_pair_clade(gt, p2, p3):
        return "T3"
    # Fallback: choose the pair with the smallest path length (safeguard for odd cases)
    d12 = gt.get_distance(p1, p2)
    d13 = gt.get_distance(p1, p3)
    d23 = gt.get_distance(p2, p3)
    m = min(d12, d13, d23)
    if m == d12: return "T1"
    if m == d13: return "T2"
    return "T3"

def safe_two_sided_p_from_z(z):
    if not math.isfinite(z):
        return 1.0
    return 2.0 * norm.sf(abs(z))

# ---------- main ----------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--windows-csv", required=True)
    p.add_argument("--species-tree", required=True)   # a single Newick from ASTRAL
    p.add_argument("--out-json")                      # optional; if omitted, print to stdout
    p.add_argument("--mu", type=float, default=7e-9)
    p.add_argument("--ne", type=float, default=1.5e4)
    p.add_argument("--block-size", type=int, default=8)
    p.add_argument("--outgroup", required=True)       # taxon name for rooting
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    COAL_FACTOR = 2 * args.mu * args.ne if args.mu and args.ne else 1.0
    B = max(1, args.block_size)

    # --- Load mapping/paths ---
    mapping_df = pd.read_csv(args.windows_csv).sort_values("start", ignore_index=True)
    mapping_df["mid_bp"] = (mapping_df["start"] + mapping_df["end"]) / 2

    # --- Load species tree, root, and identify ingroup sister pair ---
    sp = Tree(load_newick(args.species_tree), format=1)
    tip_names = [t.name for t in sp.iter_leaves()]
    if args.outgroup not in tip_names:
        raise SystemExit(f"Outgroup {args.outgroup} not found in species tree tips: {tip_names}")
    sp.set_outgroup(sp.search_nodes(name=args.outgroup)[0])
    ingroup = [t for t in tip_names if t != args.outgroup]
    if len(ingroup) != 3:
        raise SystemExit(f"Expected exactly 3 ingroup taxa; found {len(ingroup)}: {ingroup}")
    # Identify species-tree sister pair and order taxa as (p1,p2 are sisters, p3 is the third)
    try:
        p1, p2 = infer_sister_pair(sp, ingroup)
    except ValueError as e:
        raise SystemExit(str(e))
    p3 = next(t for t in ingroup if t not in (p1, p2))
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

    # --- First pass over all gene trees to label topologies and distances ---
    # Store per-tree info so we can (i) estimate tau if needed and (ii) aggregate into blocks.
    per_tree = []
    total_n = 0
    total_n2 = 0
    total_n3 = 0

    for gt in gene_trees:
        # root gene tree at the outgroup; will raise KeyError if taxa missing
        gt.set_outgroup(gt.search_nodes(name=args.outgroup)[0])

        topo = label_topology_by_splits(gt, p1, p2, p3)
        d = None
        if topo == "T2":
            d = float(gt.get_distance(p1, p3))
        elif topo == "T3":
            d = float(gt.get_distance(p2, p3))

        per_tree.append((topo, d))
        total_n += 1
        if topo == "T2": total_n2 += 1
        if topo == "T3": total_n3 += 1

    # --- Determine tau (and thus expected discordance) ---
    if math.isfinite(tau_species) and tau_species > 0:
        print(f"Using species-tree tau: {tau_species} coalescent units", file=sys.stderr)
        tau_hat_global = tau_species  # prefer ASTRAL's coalescent-unit internal branch
    else:
        # Fallback: method-of-moments from genome-wide discordant fraction
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
        d_T2, d_T3 = [], []
        disc_ind = []  # 1 for discordant (T2/T3), 0 for concordant (T1)
        sym_y = []     # +1 for T2, -1 for T3 (discordant only)

        for topo, d in trees:
            if topo == "T1":
                n1 += 1
                disc_ind.append(0.0)
            elif topo == "T2":
                n2 += 1
                disc_ind.append(1.0)
                sym_y.append(1.0)
                if d is not None: d_T2.append(d)
            elif topo == "T3":
                n3 += 1
                disc_ind.append(1.0)
                sym_y.append(-1.0)
                if d is not None: d_T3.append(d)

        n = max(1, n1 + n2 + n3)
        obs_disc = (n2 + n3) / n

        # --- total discordance test: jackknife SE of mean(disc_ind) vs expected ---
        m_disc, se_disc = jackknife_mean(disc_ind) if len(disc_ind) > 0 else (obs_disc, float("inf"))
        # use two-sided test around the expected value
        z_disc = (m_disc - p_disc_expected) / se_disc if se_disc > 0 and math.isfinite(se_disc) else 0.0
        p_tot = safe_two_sided_p_from_z(z_disc) if se_disc > 0 and math.isfinite(se_disc) else 1.0

        # --- symmetry test on discordant trees only: E[mean(sym_y)] = 0 under ILS ---
        if len(sym_y) >= 2:
            m_sym, se_sym = jackknife_mean(sym_y)
            z_sym = m_sym / se_sym if se_sym > 0 and math.isfinite(se_sym) else 0.0
            p_sym = safe_two_sided_p_from_z(z_sym) if se_sym > 0 and math.isfinite(se_sym) else 1.0
        else:
            p_sym = None

        mode = "sister_introgression" if obs_disc < p_disc_expected else "nonsister_test"

        records.append({
            'start_idx': int(start_idx),
            'mid_BP': float(mid),
            'tau_hat': float(tau_hat_global),           # now species-tree (or MoM fallback), constant across blocks
            'obs_disc_frac': float(obs_disc),
            'exp_disc_frac': float(p_disc_expected),
            'mode': mode,
            'p_symmetry': float(p_sym) if p_sym is not None else None,
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

    # Global test (jackknife across blocks) for mean difference obs - exp
    gdiff, gse = jackknife_mean_diff(dfb['obs_disc_frac'].values, dfb['exp_disc_frac'].values)
    z_global = gse and (gdiff / gse) if (gse and gse > 0 and math.isfinite(gse)) else 0.0
    p_global = safe_two_sided_p_from_z(z_global) if (gse and gse > 0 and math.isfinite(gse)) else 1.0

    # Prepare JSON-safe payload
    blocks_json = dfb.replace({np.nan: None}).to_dict(orient='records')
    payload = {
        "params": {
            "mu": args.mu,
            "ne": args.ne,
            "coal_factor": COAL_FACTOR,
            "block_size": B,
            "alpha": args.alpha,
            "outgroup": args.outgroup,
            # Explicit taxa order used: (p1,p2) are the species sisters => T1;
            # T2 is (p1,p3), T3 is (p2,p3).
            "taxa": taxa,
        },
        "global": {
            "jackknife_mean_diff": gdiff,
            "jackknife_se": gse if (gse and math.isfinite(gse)) else None,
            "z_global": z_global,
            "p_global": p_global,
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
