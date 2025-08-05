# file: scripts/introgression_scan_bl.py
import argparse, sys, re, math, json
import numpy as np, pandas as pd
from ete3 import Tree
from scipy.stats import norm
from statsmodels.stats.multitest import multipletests

# ---------------- utilities ----------------

def load_newick_text(path):
    with open(path) as fh:
        return re.sub(r"\[[^\]]*\]", "", fh.read().strip())

def is_strict_pair_clade(tree, a, b):
    ca = tree.get_common_ancestor(a, b)
    return set(ca.get_leaf_names()) == {a, b}

def infer_triplet_order(sp, outgroup):
    tips = [t.name for t in sp.iter_leaves()]
    if outgroup not in tips:
        raise SystemExit(f"Outgroup {outgroup} not found in species tree tips: {tips}")
    sp.set_outgroup(sp.search_nodes(name=outgroup)[0])
    ingroup = [t for t in tips if t != outgroup]
    if len(ingroup) != 3:
        raise SystemExit(f"Expected exactly 3 ingroup taxa; found {len(ingroup)}: {ingroup}")

    a, b, c = ingroup
    for p in [(a,b), (a,c), (b,c)]:
        if is_strict_pair_clade(sp, *p):
            p1, p2 = p
            p3 = next(t for t in ingroup if t not in p)
            return [p1, p2, p3]
    raise SystemExit("Could not identify a strict sister ingroup pair on the species tree.")

def label_topology_by_splits(gt, p1, p2, p3):
    if is_strict_pair_clade(gt, p1, p2):
        return "T1"  # concordant with species tree
    if is_strict_pair_clade(gt, p1, p3):
        return "T2"  # discordant: (p1,p3)
    if is_strict_pair_clade(gt, p2, p3):
        return "T3"  # discordant: (p2,p3)
    # fallback by distances if clade test is inconclusive
    d12 = gt.get_distance(p1, p2)
    d13 = gt.get_distance(p1, p3)
    d23 = gt.get_distance(p2, p3)
    m = min(d12, d13, d23)
    if m == d12: return "T1"
    if m == d13: return "T2"
    return "T3"

def safe_two_sided_p_from_z(z):
    if not math.isfinite(z): return 1.0
    return 2.0 * norm.sf(abs(z))

def jackknife_vals(vals):
    """Return (mean, jackknife SE) for a 1D array-like; inf SE if <2."""
    x = np.asarray(vals, dtype=float)
    n = len(x)
    if n == 0:
        return float("nan"), float("inf")
    m = float(np.mean(x))
    if n < 2:
        return m, float("inf")
    jk = [float(np.mean(np.delete(x, i))) for i in range(n)]
    jk_mean = float(np.mean(jk))
    se = math.sqrt((n - 1) / n * float(np.sum((np.array(jk) - jk_mean) ** 2)))
    return m, se

def jackknife_diff_of_means(a, b):
    """Jackknife SE for (mean(a) - mean(b)) over the union of items."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    nA, nB = len(a), len(b)
    if nA == 0 or nB == 0:
        diff = float("nan")
        se = float("inf")
        return diff, se
    diff = float(np.mean(a) - np.mean(b))
    # build a combined leave-one-out over indices from a and then b
    if nA + nB < 2:
        return diff, float("inf")
    jk_vals = []
    for i in range(nA):
        a_ = np.delete(a, i)
        jk_vals.append(float(np.mean(a_) - np.mean(b)) if len(a_) > 0 else diff)
    for j in range(nB):
        b_ = np.delete(b, j)
        jk_vals.append(float(np.mean(a) - np.mean(b_)) if len(b_) > 0 else diff)
    jk_vals = np.array(jk_vals, dtype=float)
    jk_mean = float(np.mean(jk_vals))
    se = math.sqrt((len(jk_vals) - 1) / len(jk_vals) * float(np.sum((jk_vals - jk_mean) ** 2)))
    return diff, se

# ---------- tiny 1D Gaussian mixture (EM) for bimodality ----------

def fit_gmm_1d(x, k=2, max_iter=200, tol=1e-6):
    """Simple EM for 1D Gaussian mixture. Returns dict with weights, means, sds, loglik, BIC."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    if n < k:
        return {"k": 1, "pi": np.array([1.0]), "mu": np.array([float(np.mean(x))]),
                "sd": np.array([float(np.std(x, ddof=1)) if n>1 else 1.0]),
                "loglik": float("nan"), "bic": float("inf")}
    # init means at quantiles, sds at sample sd, weights uniform
    qs = np.linspace(0.1, 0.9, k)
    mu = np.quantile(x, qs)
    sd = np.full(k, max(np.std(x, ddof=1), 1e-6))
    pi = np.full(k, 1.0/k)
    last_ll = -np.inf

    for _ in range(max_iter):
        # E-step
        comp = []
        for j in range(k):
            v = sd[j]**2 if sd[j] > 1e-12 else 1e-12
            comp.append(pi[j] * (1.0 / math.sqrt(2*math.pi*v)) * np.exp(-0.5*(x - mu[j])**2 / v))
        comp = np.stack(comp, axis=1)  # n x k
        s = comp.sum(axis=1, keepdims=True)
        s[s == 0.0] = 1e-300
        r = comp / s  # responsibilities

        # M-step
        rsum = r.sum(axis=0) + 1e-12
        pi = rsum / n
        mu = (r * x[:, None]).sum(axis=0) / rsum
        sd = np.sqrt(((r * (x[:, None] - mu)**2).sum(axis=0) / rsum).clip(min=1e-12))

        # log-likelihood
        ll = float(np.sum(np.log(s)))
        if abs(ll - last_ll) < tol:
            last_ll = ll
            break
        last_ll = ll

    num_params = k - 1 + k + k  # (k-1) weights + k means + k variances
    bic = -2.0 * last_ll + num_params * math.log(max(n, 1))
    return {"k": k, "pi": pi, "mu": mu, "sd": sd, "loglik": last_ll, "bic": bic}

def gmm_bic_1_or_2(x):
    """Fit k=1 and k=2; return tuple (fit1, fit2, delta_BIC = BIC1 - BIC2)."""
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < 8:   # need a few points for a meaningful mixture
        return None, None, None
    f1 = fit_gmm_1d(x, k=1)
    f2 = fit_gmm_1d(x, k=2)
    dbic = f1["bic"] - f2["bic"]
    return f1, f2, dbic

# ---------------- main ----------------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--windows-csv", required=True)
    p.add_argument("--species-tree", required=True)
    p.add_argument("--out-json")
    p.add_argument("--mu", type=float, default=7e-9)   # kept for CLI compatibility
    p.add_argument("--ne", type=float, default=1.5e4)  # kept for CLI compatibility
    p.add_argument("--block-size", type=int, default=8)
    p.add_argument("--outgroup", required=True)
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    B = max(1, args.block_size)

    # --- Load windows ---
    mapping_df = pd.read_csv(args.windows_csv).sort_values("start", ignore_index=True)
    print(f"Loaded {len(mapping_df)} windows from {args.windows_csv}")
    mapping_df["mid_bp"] = (mapping_df["start"] + mapping_df["end"]) / 2.0

    # --- Species tree order: taxa = [P1, P2, P3] (P1,P2 are sisters) ---
    sp = Tree(load_newick_text(args.species_tree), format=1)
    taxa = infer_triplet_order(sp, args.outgroup)

    print(f"Taxa inferred from species tree: {taxa}")
    print(sp.get_ascii(show_internal=True, attributes=["name"]))
    P1, P2, P3 = taxa
    print(P1, P2, P3, 'EXTRACTED P1, P2, P3 TAXA')

    # --- Load gene trees; compute pairwise distances and topology per window ---
    def load_tree(path):
        return Tree(load_newick_text(path), format=1)

    rows = []
    for i, row in mapping_df.iterrows():
        print(row)
        gt = load_tree(row["tree"])
        print(f"Processing window {i+1}/{len(mapping_df)}: {row['tree']}", row)
        leafs = {n.name for n in gt.iter_leaves()}
        if not ({P1, P2, P3} <= leafs):
            rows.append((np.nan, np.nan, np.nan, "NA"))
            continue
        topo = label_topology_by_splits(gt, P1, P2, P3)
        d12 = float(gt.get_distance(P1, P2))
        d13 = float(gt.get_distance(P1, P3))
        d23 = float(gt.get_distance(P2, P3))
        rows.append((d12, d13, d23, topo))

    mapping_df["d12"], mapping_df["d13"], mapping_df["d23"], mapping_df["topo"] = zip(*rows)

    # --- Per-window D3 (diagnostic) ---
    eps = 1e-12
    denom = mapping_df["d23"] + mapping_df["d13"]
    mapping_df["D3_window"] = np.where(denom.abs() > eps, (mapping_df["d23"] - mapping_df["d13"]) / denom, np.nan)

    # --- Block loop ---
    block_records = []
    for start_idx in range(0, len(mapping_df), B):
        sub = mapping_df.iloc[start_idx:start_idx + B]
        mid = float(sub["mid_bp"].mean())

        # valid windows (finite distances)
        mask_valid = np.isfinite(sub["d12"]) & np.isfinite(sub["d13"]) & np.isfinite(sub["d23"])
        w = sub[mask_valid]
        n_used = int(len(w))
        if n_used == 0:
            block_records.append({
                "start_idx": int(start_idx), "mid_BP": mid,
                # D3
                "d3": None, "se_d3": None, "z_d3": 0.0, "p_d3": 1.0,
                "mean_d23": None, "mean_d13": None, "numer_sum": None, "denom_sum": None,
                "n_windows_used": 0,
                # topology counts
                "count_T1": 0, "count_T2": 0, "count_T3": 0,
                # mixture
                "mix_pair": None, "mix_topo": None, "mix_n": 0,
                "mix_bic1": None, "mix_bic2": None, "mix_dbic": None,
                "mix_pi1": None, "mix_mu1": None, "mix_sd1": None,
                "mix_mu2": None, "mix_sd2": None,
                # direction
                "dir_test_for": None, "dir_diff": None, "dir_se": None,
                "dir_z": 0.0, "p_dir": 1.0, "dir_call": None
            })
            continue

        # --- D3 block statistic (ratio of sums) with jackknife SE ---
        numer = float((w["d23"] - w["d13"]).sum())
        denom = float((w["d23"] + w["d13"]).sum())
        if denom <= eps:
            d3_block, se_d3, z_d3, p_d3 = float("nan"), float("inf"), 0.0, 1.0
        else:
            d3_block = numer / denom
            if n_used < 2:
                se_d3, z_d3, p_d3 = float("inf"), 0.0, 1.0
            else:
                jk_vals = []
                for i in range(n_used):
                    numer_i = numer - float((w["d23"] - w["d13"]).iloc[i])
                    denom_i = denom - float((w["d23"] + w["d13"]).iloc[i])
                    if denom_i <= eps:
                        jk_vals.append(d3_block)
                    else:
                        jk_vals.append(numer_i / denom_i)
                jk_vals = np.array(jk_vals, dtype=float)
                jk_mean = float(np.mean(jk_vals))
                se_d3 = math.sqrt((n_used - 1) / n_used * float(np.sum((jk_vals - jk_mean) ** 2)))
                z_d3 = d3_block / se_d3 if (se_d3 > 0 and math.isfinite(se_d3)) else 0.0
                p_d3 = 2.0 * norm.sf(abs(z_d3)) if (se_d3 > 0 and math.isfinite(se_d3)) else 1.0

        # --- Topology counts in the block ---
        cT1 = int((w["topo"] == "T1").sum())
        cT2 = int((w["topo"] == "T2").sum())
        cT3 = int((w["topo"] == "T3").sum())

        # --- Choose the "affected" discordant topology for branch-length mixture & direction ---
        # If introgression is between (P2,P3), T3 is the affected topology and the affected pair is (P2,P3).
        # If between (P1,P3), T2 is affected and the pair is (P1,P3).
        if cT2 == 0 and cT3 == 0:
            affected_topo = None
        else:
            affected_topo = "T3" if cT3 >= cT2 else "T2"

        # --- QuIBL-like bimodality test on the affected pair's distances within the affected topology ---
        mix_fields = {
            "mix_pair": None, "mix_topo": None, "mix_n": 0,
            "mix_bic1": None, "mix_bic2": None, "mix_dbic": None,
            "mix_pi1": None, "mix_mu1": None, "mix_sd1": None,
            "mix_mu2": None, "mix_sd2": None
        }
        if affected_topo is not None:
            if affected_topo == "T3":
                # affected pair is (P2,P3); collect their distances among T3 trees only
                x = w.loc[w["topo"] == "T3", "d23"].values
                mix_fields["mix_pair"] = f"{P2}-{P3}"
                mix_fields["mix_topo"] = "T3"
            else:  # T2
                x = w.loc[w["topo"] == "T2", "d13"].values
                mix_fields["mix_pair"] = f"{P1}-{P3}"
                mix_fields["mix_topo"] = "T2"

            x = x[np.isfinite(x)]
            mix_fields["mix_n"] = int(len(x))
            f1, f2, dbic = gmm_bic_1_or_2(x)
            if dbic is not None:
                mix_fields["mix_bic1"] = float(f1["bic"])
                mix_fields["mix_bic2"] = float(f2["bic"])
                mix_fields["mix_dbic"] = float(dbic)
                # sort components by mean (older = larger distance; recent = smaller)
                order = np.argsort(f2["mu"])
                pi = f2["pi"][order]
                mu = f2["mu"][order]
                sd = f2["sd"][order]
                mix_fields["mix_pi1"] = float(pi[0])     # weight of more recent (smaller) mode
                mix_fields["mix_mu1"] = float(mu[0])
                mix_fields["mix_sd1"] = float(sd[0])
                mix_fields["mix_mu2"] = float(mu[1])     # older mode
                mix_fields["mix_sd2"] = float(sd[1])

        # --- D2-like direction inference ---
        # Compare a baseline divergence in T1 vs the same divergence in the affected discordant topology.
        # If affected_topo == T3 (P2-P3 introgression candidate):
        #   test P1-P3 divergence: d13 in T3 vs d13 in T1
        #   lower in T3 -> supports P2->P3 ; ~equal -> supports P3->P2
        # If affected_topo == T2 (P1-P3 introgression candidate):
        #   test P2-P3 divergence: d23 in T2 vs d23 in T1
        dir_fields = {"dir_test_for": None, "dir_diff": None, "dir_se": None, "dir_z": 0.0, "p_dir": 1.0, "dir_call": None}
        if affected_topo is not None and cT1 > 0:
            if affected_topo == "T3":
                a = w.loc[w["topo"] == "T3", "d13"].values  # test set
                b = w.loc[w["topo"] == "T1", "d13"].values  # baseline
                tgt_pair = f"{P1}-{P3}"
                dir_fields["dir_test_for"] = f"direction between {P2}<->{P3} via {tgt_pair} divergence"
                diff, se = jackknife_diff_of_means(a, b)
                z = diff / se if (se > 0 and math.isfinite(se)) else 0.0
                p = safe_two_sided_p_from_z(z)
                # call: if diff < 0 and significant -> P2->P3; if ~0 -> P3->P2; else ambiguous
                if se > 0 and math.isfinite(se) and p < 0.05 and diff < 0:
                    call = f"{P2}->{P3}"
                elif se > 0 and math.isfinite(se) and p >= 0.05:
                    call = f"{P3}->{P2} or low power"
                else:
                    call = "ambiguous"
            else:  # affected_topo == "T2"
                a = w.loc[w["topo"] == "T2", "d23"].values
                b = w.loc[w["topo"] == "T1", "d23"].values
                tgt_pair = f"{P2}-{P3}"
                dir_fields["dir_test_for"] = f"direction between {P1}<->{P3} via {tgt_pair} divergence"
                diff, se = jackknife_diff_of_means(a, b)
                z = diff / se if (se > 0 and math.isfinite(se)) else 0.0
                p = safe_two_sided_p_from_z(z)
                if se > 0 and math.isfinite(se) and p < 0.05 and diff < 0:
                    call = f"{P1}->{P3}"
                elif se > 0 and math.isfinite(se) and p >= 0.05:
                    call = f"{P3}->{P1} or low power"
                else:
                    call = "ambiguous"

            dir_fields["dir_diff"] = float(diff) if math.isfinite(diff) else None
            dir_fields["dir_se"] = float(se) if math.isfinite(se) else None
            dir_fields["dir_z"] = float(z)
            dir_fields["p_dir"] = float(p)
            dir_fields["dir_call"] = call

        # accumulate block record
        rec = {
            # basics
            "start_idx": int(start_idx),
            "mid_BP": mid,
            "n_windows_used": n_used,
            # D3 fields
            "d3": float(d3_block) if (math.isfinite(d3_block)) else None,
            "se_d3": float(se_d3) if (math.isfinite(se_d3)) else None,
            "z_d3": float(z_d3),
            "p_d3": float(p_d3),
            "mean_d23": float(w["d23"].mean()) if n_used > 0 else None,
            "mean_d13": float(w["d13"].mean()) if n_used > 0 else None,
            "numer_sum": float(numer) if math.isfinite(d3_block) else None,
            "denom_sum": float(denom) if math.isfinite(d3_block) else None,
            # topology counts
            "count_T1": cT1, "count_T2": cT2, "count_T3": cT3,
        }
        rec.update(mix_fields)
        rec.update(dir_fields)
        block_records.append(rec)

    dfb = pd.DataFrame(block_records)

    # FDR: D3 and direction p-values across blocks
    dfb["p_d3_fdr"] = multipletests(dfb["p_d3"].fillna(1.0).values, method="fdr_bh")[1]
    dfb["sig_d3"] = (dfb["p_d3_fdr"] < args.alpha)

    dfb["p_dir_fdr"] = multipletests(dfb["p_dir"].fillna(1.0).values, method="fdr_bh")[1]
    dfb["sig_dir"] = (dfb["p_dir_fdr"] < args.alpha)

    # Global D3 across blocks (jackknife on block d3)
    d3_series = dfb["d3"].dropna().values
    if len(d3_series) >= 2:
        # reuse jackknife_vals for the mean
        gmean, gse = jackknife_vals(d3_series)
        z_global = gmean / gse if (gse > 0 and math.isfinite(gse)) else 0.0
        p_global = safe_two_sided_p_from_z(z_global) if (gse > 0 and math.isfinite(gse)) else 1.0
    elif len(d3_series) == 1:
        gmean, gse, z_global, p_global = float(d3_series[0]), float("inf"), 0.0, 1.0
    else:
        gmean, gse, z_global, p_global = float("nan"), None, 0.0, 1.0

    # JSON payload
    payload = {
        "params": {
            "mu": args.mu,
            "ne": args.ne,
            "coal_factor": None,           # not used here
            "block_size": B,
            "alpha": args.alpha,
            "outgroup": args.outgroup,     # retained for consistency
            "taxa": [P1, P2, P3],
            "statistic": "D3 + branch-length mixture (QuIBL-like) + D2-like direction"
        },
        "global": {
            "d3_mean": gmean if (gmean == gmean) else None,
            "jackknife_se": gse if (gse is None or math.isfinite(gse)) else None,
            "z_global": z_global,
            "p_global": p_global
        },
        "blocks": dfb.replace({np.nan: None}).to_dict(orient="records"),
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
