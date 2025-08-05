import argparse, glob, os, re, subprocess, sys
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use('Agg')  # headless backend
import matplotlib.pyplot as plt


def collect_gene_trees(directory='.'):
    files = sorted(glob.glob(os.path.join(directory, '*.nwk')))
    trees = []
    for p in files:
        raw = open(p).read().strip()
        tree = raw.rstrip(';').strip()
        if tree: trees.append(tree)
    if not trees:
        raise RuntimeError("No .nwk files in " + directory)
    return trees

def write_trees_txt(trees, directory='.'):
    path = os.path.join(directory, 'gene_trees.txt')
    with open(path,'w') as f:
        for t in trees: f.write(t+"\n")
    print(f"Wrote {len(trees)} trees -> {path}")
    return path

def write_nexus(trees, r, directory='.'):
    path = os.path.join(directory, f'network_control_r{r}.nex')
    with open(path,'w') as nex:
        nex.write("#NEXUS\n\nBEGIN TREES;\n")
        for i,t in enumerate(trees,1):
            nex.write(f"  Tree gt{i} = {t};\n")
        nex.write("END;\n\nBEGIN PHYLONET;\n")
        nex.write(f"  InferNetwork_MPL (all) {r};\nEND;\n")
    return path

def run_phylonet(jar, nexus):
    proc = subprocess.run(
        [jar,nexus],
        capture_output=True, text=True
    )
    proc.check_returncode()
    return proc.stdout

def parse_logl(output):
    m = re.search(r'^(-?\d+\.\d+):', output, re.MULTILINE)
    if not m:
        raise ValueError("Could not find logL")
    return float(m.group(1))

def extract_enewick(phylonet_output: str) -> str:
    """
    Try to extract an Extended-Newick network line ending with ';'.
    This is robust enough for typical PhyloNet output.
    """
    # Prefer lines with '#H' (hybrids) or at least something that looks like a Newick
    candidates = [ln.strip() for ln in phylonet_output.splitlines()
                  if ln.strip().endswith(';') and '(' in ln]
    if not candidates:
        raise ValueError("Could not find a network string in PhyloNet output")
    # Heuristic: pick the longest candidate (often the final network)
    return max(candidates, key=len)

def write_enewick(s: str, path: str):
    with open(path, "w") as f:
        f.write(s.strip() + ("\n" if not s.endswith("\n") else ""))
    return path

def run_julia_plot(enewick_path: str, out_image: str):
    # Absolute path to Julia in the container (you can also just use "julia")
    julia = "/usr/local/bin/julia"

    # Resolve the script path robustly (adjust if your layout differs)
    script = "/app/backend/src/scripts/plot_phylonet.jl"

    # Make sure depot is visible (already set in Dockerfile, but safe to enforce)
    # env = os.environ.copy()
    # env.setdefault("JULIA_DEPOT_PATH", "/opt/julia_depot")

    cmd = [
        julia,
        "--color=yes",
        "--threads=auto",       # optional
        script,
        "--enewick", enewick_path,
        "--out", out_image,
    ]

    proc = subprocess.run(cmd, text=True, capture_output=True)
    if proc.returncode != 0:
        # surface full error context
        sys.stderr.write(proc.stderr)
        sys.stdout.write(proc.stdout)
        raise subprocess.CalledProcessError(proc.returncode, cmd, output=proc.stdout, stderr=proc.stderr)



def main():
    p = argparse.ArgumentParser()
    p.add_argument('--tree-directory', type=str, required=True,
                   help='Directory containing the Newick tree files.')
    p.add_argument('--max-reticulations', type=int, default=1,
                   help='Maximum number of reticulations to allow in the network.')
    p.add_argument('--phylotxt', type=str, required=True,
                   help='Path to the PhyloText file.')
    p.add_argument('--phylo-plot', type=str, required=True,
                   help='Path to the PhyloPlot file.')
    p.add_argument('--phylo-intro-plot', type=str, required=True,
                   help='Path to the PhyloIntroPlot file.')
    p.add_argument('--output-directory', type=str, default='.',
                   help='Directory to write output files.')
    args = p.parse_args()
    trees = collect_gene_trees(args.tree_directory)
    write_trees_txt(trees, args.output_directory)

    records = []
    for r in range(args.max_reticulations + 1):
        nex = write_nexus(trees, r, args.output_directory)
        out = run_phylonet('phylonet', nex)
        logL = parse_logl(out)
        records.append({'r':r, 'logL':logL})
        print(f"r={r}  logL={logL:.6f}")

    df = pd.DataFrame(records).set_index('r')
    best_r = df['logL'].idxmax()
    print("\nBest r by max log‑likelihood:", best_r)

    # Re-run with best_r and dump full output
    best_nex = write_nexus(trees, best_r, args.output_directory)
    best_out = run_phylonet('phylonet', best_nex)
    print("Full PhyloNet output for r =", best_r, best_out)
    enewick = extract_enewick(best_out)
    enewick_path = os.path.join(args.output_directory, "best_network.enewick")
    write_enewick(enewick, enewick_path)
    run_julia_plot(enewick_path, args.phylo_intro_plot)
    print("Saved network plot to", args.phylo_intro_plot)
    with open(args.phylotxt,'w') as f:
        f.write(best_out)
    print("Wrote full PhyloNet output for r =", best_r, "to", args.phylotxt)

    # Plot
    plt.figure()
    plt.plot(df.index, df['logL'], marker='o')
    plt.xlabel('r (reticulations)')
    plt.ylabel('Log‑Likelihood')
    plt.title('Log‑Likelihood vs Number of Reticulations')
    plt.tight_layout()
    plt.savefig(args.phylo_plot, dpi=150)
    plt.close()
    print("Saved plot to", args.phylo_plot)


if __name__ == "__main__":
    sys.exit(main())
