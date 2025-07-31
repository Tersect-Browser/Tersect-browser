# file: scripts/introgression_scan.py
import argparse, os, sys, re, math, json
import numpy as np, pandas as pd
from ete3 import Tree
from scipy.stats import norm
from statsmodels.stats.multitest import multipletests

def jackknife_mean_diff(obs, exp):
    diffs = obs - exp
    n = len(diffs)
    if n < 2:
        return float(np.mean(diffs)), float("inf")
    jk_means = [float(np.mean(np.delete(diffs, i))) for i in range(n)]
    jk_mean = float(np.mean(jk_means))
    se = math.sqrt((n - 1) / n * float(np.sum((np.array(jk_means) - jk_mean)**2)))
    return jk_mean, se

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

    # --- Load species tree and taxa (infer taxa from tips) ---
    with open(args.species_tree) as f:
        sp = Tree(f.read().strip(), format=1)
    tip_names = [t.name for t in sp.iter_leaves()]
    if args.outgroup not in tip_names:
        raise SystemExit(f"Outgroup {args.outgroup} not found in species tree tips: {tip_names}")
    sp.set_outgroup(sp.search_nodes(name=args.outgroup)[0])
    taxa = tip_names  # maintain whatever order is in the tree

    # --- Load gene trees from files listed in CSV ---
    def load_tree(path):
        with open(path) as fh:
            return Tree(re.sub(r"\[[^\]]*\]", "", fh.read().strip()), format=1)
    gene_trees = [load_tree(p) for p in mapping_df["tree"]]

    # --- Block aggregation ---
    blocks = [
        (i, gene_trees[i:i+B], float(mapping_df["mid_bp"].iloc[i:i+B].mean()))
        for i in range(0, len(gene_trees), B)
    ]

    def get_topo_and_dist(gt, taxa):
        gt.set_outgroup(gt.search_nodes(name=args.outgroup)[0])
        dists = {
            ("T1", (taxa[0], taxa[1])): gt.get_distance(taxa[0], taxa[1]),
            ("T2", (taxa[0], taxa[2])): gt.get_distance(taxa[0], taxa[2]),
            ("T3", (taxa[1], taxa[2])): gt.get_distance(taxa[1], taxa[2]),
        }
        (topo, pair), d = min(dists.items(), key=lambda kv: kv[1])
        return topo, d

    records = []
    for start_idx, trees, mid in blocks:
        counts = {"T1":0, "T2":0, "T3":0}
        int_brlens = []
        d_T2, d_T3 = [], []
        for gt in trees:
            topo, d = get_topo_and_dist(gt.copy(), taxa)
            counts[topo] += 1
            if topo == "T2": d_T2.append(d)
            if topo == "T3": d_T3.append(d)
            ca = gt.get_common_ancestor(taxa[0], taxa[1])
            if ca.up is not None:
                int_brlens.append(ca.dist / COAL_FACTOR)

        tau_hat = float(np.median(int_brlens)) if int_brlens else 0.0
        p_disc_w = 2 * math.exp(-tau_hat) / 3
        n1,n2,n3 = counts["T1"], counts["T2"], counts["T3"]
        n = max(1, n1 + n2 + n3)
        obs_disc = (n2 + n3) / n
        sd = math.sqrt(p_disc_w * (1 - p_disc_w) / n)
        z_disc = (obs_disc - p_disc_w) / sd if sd>0 else 0.0
        p_tot = norm.sf(z_disc) if obs_disc>p_disc_w else norm.cdf(z_disc)

        sym_p = float("nan")
        minor = n2 + n3
        if minor>0:
            z_sym = (n2 - n3) / math.sqrt(minor * 0.25)
            sym_p = norm.sf(z_sym) if n2>n3 else norm.cdf(z_sym)

        mode = "sister_introgression" if obs_disc < p_disc_w else "nonsister_test"
        records.append({
            'start_idx': int(start_idx),
            'mid_BP': float(mid),
            'tau_hat': float(tau_hat),
            'obs_disc_frac': float(obs_disc),
            'exp_disc_frac': float(p_disc_w),
            'mode': mode,
            'p_symmetry': float(sym_p) if not np.isnan(sym_p) else None,
            'p_total': float(p_tot),
            'n_trees': int(n),
            'count_T2': int(n2),
            'count_T3': int(n3),
        })

    dfb = pd.DataFrame(records)
    # FDR
    dfb['p_total_fdr'] = multipletests(dfb['p_total'], method='fdr_bh')[1]
    dfb['p_sym_fdr']   = multipletests(dfb['p_symmetry'].fillna(1.0), method='fdr_bh')[1]
    dfb['sig_total']   = (dfb['p_total_fdr'] < args.alpha)
    dfb['sig_sym']     = (dfb['p_sym_fdr'] < args.alpha)

    # Global test (jackknife)
    gdiff, gse = jackknife_mean_diff(dfb['obs_disc_frac'].values, dfb['exp_disc_frac'].values)
    z_global = gdiff / gse if gse > 0 else 0.0
    p_global = 2 * norm.sf(abs(z_global)) if gse > 0 else 1.0

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
            "taxa": taxa,
        },
        "global": {
            "jackknife_mean_diff": gdiff,
            "jackknife_se": gse if math.isfinite(gse) else None,
            "z_global": z_global,
            "p_global": p_global,
        },
        "blocks": blocks_json,
    }

    text = json.dumps(payload, separators=(",",":"), allow_nan=False)
    if args.out_json:
        with open(args.out_json, "w") as fh:
            fh.write(text)
    else:
        print(text)

    return 0

if __name__ == "__main__":
    sys.exit(main())
