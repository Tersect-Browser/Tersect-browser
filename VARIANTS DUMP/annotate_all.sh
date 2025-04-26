#!/usr/bin/env bash
#
# annotate_all_variants.sh
#
# Usage:
#   ./annotate_all_variants.sh
#
# Requirements:
#   * add_samples_by_eff.awk   – the awk script from before
#   * info2sample.tsv          – lookup table built earlier
# Both must be reachable via the paths set below.

set -euo pipefail

AWK_SCRIPT="./add_samples_by_eff.awk"   # path to the awk file
LOOKUP_TSV="./info2sample.tsv"         # EFF → accession list

# Sanity-check inputs
[[ -f $AWK_SCRIPT ]]  || { echo "Missing $AWK_SCRIPT" >&2; exit 1; }
[[ -f $LOOKUP_TSV ]]  || { echo "Missing $LOOKUP_TSV" >&2; exit 1; }

# Walk directory tree, annotate each variants.txt
find . -type f -name 'variants.txt' | while read -r VAR_FILE; do
    DIR=$(dirname "$VAR_FILE")
    OUT="$DIR/variants_with_acc.txt"

    echo "▶  $VAR_FILE  →  $OUT"
    awk -f "$AWK_SCRIPT"  "$LOOKUP_TSV"  "$VAR_FILE"  > "$OUT"
done

echo "✔  All variants.txt files annotated."
