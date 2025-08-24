# file: scripts/introgression_scan_dct_blt.py
import argparse, sys, re, math, json
import numpy as np, pandas as pd
from ete3 import Tree
from scipy.stats import binomtest, norm
from statsmodels.stats.multitest import multipletests

# ---------- helpers ----------

def load_newick(path):
    with open(path) as fh:
        # strip comments like [S=...] that sometimes appear in ASTRAL/gene trees
        return re.sub(r"\[[^\]]*\]", "", fh.read().strip())

def infer_sister_pair_from_quartet(tree, trio, outgroup):
    a, b, c = trio
    for x, y, other in ((a,b,c), (a,c,b), (b,c,a)):
        ca = tree.get_common_ancestor(x, y)
        if other not in set(leaf.name for leaf in ca.get_leaves()):
            return x, y
    raise ValueError("Unresolved trio (polytomy?) in pruned tree.")

def label_topology_quartet(gt_q, p1, p2, p3, outgroup):
    """Strict topology labeling (T1, T2, T3)."""
    try:
        lca_12 = gt_q.get_common_ancestor([p1, p2])
        lca_13 = gt_q.get_common_ancestor([p1, p3])
        lca_23 = gt_q.get_common_ancestor([p2, p3])
    except Exception:
        return "ERROR"

    leaves_12 = {leaf.name for leaf in lca_12.get_leaves()}
    leaves_13 = {leaf.name for leaf in lca_13.get_leaves()}
    leaves_23 = {leaf.name for leaf in lca_23.get_leaves()}

    if outgroup not in leaves_12 and leaves_12 == {p1, p2}:
        return "T1"
    if outgroup not in leaves_13 and leaves_13 == {p1, p3}:
        return "T2"
    if outgroup not in leaves_23 and leaves_23 == {p2, p3}:
        return "T3"
    return "ERROR"

def jackknife_diff_means(group_a, group_b):
    """Jackknife SE for delta = mean(A) - mean(B)."""
    a = np.asarray(group_a, dtype=float)
    b = np.asarray(group_b, dtype=float)
    if len(a) == 0 or len(b) == 0:
        return (float("nan"), float("inf"))

    delta = float(np.mean(a) - np.mean(b))
    m = len(a) + len(b)
    if m < 2:
        return (delta, float("inf"))

    jk_vals = []
    # leave-one-out from A
    for i in range(len(a)):
        a_loo = np.delete(a, i)
        if len(a_loo) > 0:
            jk_vals.append(float(np.mean(a_loo) - np.mean(b)))
    # leave-one-out from B
    for j in range(len(b)):
        b_loo = np.delete(b, j)
        if len(b_loo) > 0:
            jk_vals.append(float(np.mean(a) - np.mean(b_loo)))

    jk_vals = np.asarray(jk_vals)
    if len(jk_vals) == 0:
        return (delta, float("inf"))

    jk_mean = float(np.mean(jk_vals))
    se = math.sqrt((len(jk_vals)-1)/len(jk_vals) * np.sum((jk_vals - jk_mean)**2))
    return (delta, se)

# ---------- main ----------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--windows-csv", required=True)
    p.add_argument("--species-tree", required=True)
    p.add_argument("--ingroup", nargs=3, required=True, metavar=("P1","P2","P3"))
    p.add_argument("--out-json")
    p.add_argument("--block-size", type=int, default=50)
    p.add_argument("--outgroup", required=True)
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    B = args.block_size

    # --- Load window table ---
    mapping_df = pd.read_csv(args.windows_csv).sort_values("start", ignore_index=True)
    mapping_df["mid_bp"] = (mapping_df["start"] + mapping_df["end"]) / 2

    # --- Load species tree and infer taxa order ---
    sp = Tree(load_newick(args.species_tree), format=1)
    leafs = {t.name for t in sp.iter_leaves()}
    need = set(args.ingroup) | {args.outgroup}
    missing = need - leafs
    if missing:
        raise SystemExit(f"Missing taxa in species tree: {sorted(missing)}")
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

    # Try to extract τ
    try:
        ca_sp = sp.get_common_ancestor(p1, p2)
        tau_species = float(ca_sp.dist) if ca_sp.dist is not None else float("nan")
        if not (math.isfinite(tau_species) and tau_species > 0):
            tau_species = float("nan")
    except Exception:
        tau_species = float("nan")

    # --- Load gene trees ---
    def load_tree(path):
        with open(path) as fh:
            return Tree(re.sub(r"\[[^\]]*\]", "", fh.read().strip()), format=1)

    gene_trees = []
    for pth in mapping_df["tree"]:
        try:
            gene_trees.append(load_tree(pth))
        except Exception:
            gene_trees.append(None)

    # --- Label topologies and distances ---
    topo_info = []
    for gt in gene_trees:
        if gt is None:
            topo_info.append(("ERROR", None))
            continue
        try:
            gt.set_outgroup(gt.search_nodes(name=args.outgroup)[0])
            gt_q = gt.copy(method="deepcopy")
            gt_q.prune([p1, p2, p3, args.outgroup], preserve_branch_length=True)
            topo = label_topology_quartet(gt_q, p1, p2, p3, args.outgroup)
            if topo == "T2":
                d = float(gt_q.get_distance(p1, p3))
            elif topo == "T3":
                d = float(gt_q.get_distance(p2, p3))
            else:
                d = None
        except Exception:
            topo, d = "ERROR", None
        topo_info.append((topo, d))

    # --- Block aggregation ---
    records = []
    for start_idx in range(0, len(mapping_df), B):
        sl = slice(start_idx, start_idx + B)
        mid = float(mapping_df["mid_bp"].iloc[sl].mean())

        n1 = n2 = n3 = n_err = 0
        d_T2, d_T3 = [], []
        for topo, d in topo_info[sl]:
            if topo == "T1": n1 += 1
            elif topo == "T2":
                n2 += 1
                if d and np.isfinite(d) and d > 0:
                    d_T2.append(d)
            elif topo == "T3":
                n3 += 1
                if d and np.isfinite(d) and d > 0:
                    d_T3.append(d)
            else: n_err += 1

        n_disc = n2 + n3
        n_tot = n1 + n_disc

        # --- DCT ---
        p_sym = float(binomtest(k=n2, n=n_disc, p=0.5).pvalue) if n_disc > 0 else 1.0
        if math.isfinite(tau_species):
            p_disc_exp = 2.0 * math.exp(-tau_species) / 3.0
            p_disc_exp = max(1e-12, min(1-1e-12, p_disc_exp))
            p_tot = float(binomtest(k=n_disc, n=n_tot, p=p_disc_exp).pvalue) if n_tot > 0 else 1.0
        else:
            p_disc_exp, p_tot = None, None

        # --- BLT ---
        if len(d_T2) > 0 and len(d_T3) > 0:
            mean_T2, mean_T3 = float(np.mean(d_T2)), float(np.mean(d_T3))
            delta, se_delta = jackknife_diff_means(d_T2, d_T3)
            z_blt = delta / se_delta if (np.isfinite(se_delta) and se_delta > 0) else 0.0
            p_blt = float(2 * norm.sf(abs(z_blt)))
        else:
            mean_T2 = mean_T3 = delta = se_delta = z_blt = float("nan")
            p_blt = 1.0

        records.append({
            "start_idx": int(start_idx),
            "mid_BP": float(mid),
            # DCT
            "n_T1": n1, "n_T2": n2, "n_T3": n3,
            "n_total": n_tot, "n_error": n_err,
            "p_sym": p_sym, "p_disc_expected": p_disc_exp, "p_total": p_tot,
            # BLT
            "mean_T2": mean_T2, "mean_T3": mean_T3,
            "delta": delta, "se_delta": se_delta,
            "z_blt": z_blt, "p_blt": p_blt
        })

    dfb = pd.DataFrame(records)

    # Apply FDR separately for DCT and BLT
    dfb["p_sym_fdr"] = multipletests(dfb["p_sym"].fillna(1.0), method="fdr_bh")[1]
    if "p_total" in dfb and dfb["p_total"].notna().any():
        dfb["p_total_fdr"] = multipletests(dfb["p_total"].fillna(1.0), method="fdr_bh")[1]
    else:
        dfb["p_total_fdr"] = np.nan
    dfb["p_blt_fdr"] = multipletests(dfb["p_blt"].fillna(1.0), method="fdr_bh")[1]

    dfb["sig_sym"] = (dfb["p_sym_fdr"] < args.alpha)
    dfb["sig_total"] = dfb["p_total_fdr"].notna() & (dfb["p_total_fdr"] < args.alpha)
    dfb["sig_blt"] = (dfb["p_blt_fdr"] < args.alpha)

    # --- JSON payload ---
    payload = {
        "params": {
            "block_size": B,
            "outgroup": args.outgroup,
            "taxa": taxa,
            "uses_tau_for_total_test": math.isfinite(tau_species)
        },
        "global": {
            "methods": ["DCT (Discordant Count Test)", "BLT (Branch Length Test)"],
            "notes": "DCT tests T2 vs T3 counts; BLT compares mean branch lengths of T2 vs T3 discordant topologies."
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
