#!/usr/bin/env bash
# Finds barcodes that identify one accession within a region.
#
# Usage: barcode_finder.sh ACCESSION CHROM START END SIZE MAX_VARIANTS FASTA TSI LOCAL_DB_PATH
#   MAX_VARIANTS may be "null" for no limit.
#
# Called by the backend with arguments passed directly (no shell), after they
# have been validated. Every expansion here is quoted, and intermediate files
# live in a private temporary directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ACCESSION="$1"
CHROM="$2"
START="$3"
END="$4"
SIZE="$5"
MAX_VARIANTS="$6"
FASTA="$7"
TSI="$8"
LOCAL_DB_PATH="$9"

REGION="${CHROM}:${START}-${END}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Variants of this accession
tersect view "$TSI" "'${ACCESSION}'" "$REGION" > "$WORK_DIR/accession_variants.tsv"
# Variants of all other accessions
tersect view "$TSI" "u(*) ^ '${ACCESSION}'" "$REGION" > "$WORK_DIR/union_variants.tsv"

args=(
  --accession "$ACCESSION"
  --fasta "$FASTA"
  --chrom "$CHROM"
  --start "$START"
  --end "$END"
  --size "$SIZE"
  --unique_variants "$WORK_DIR/accession_variants.tsv"
  --union_variants "$WORK_DIR/union_variants.tsv"
  --config "$LOCAL_DB_PATH"
)
if [[ "$MAX_VARIANTS" != "null" ]]; then
  args+=(--max_variants "$MAX_VARIANTS")
fi

# Prints the output file path as its last line.
python3 "$SCRIPT_DIR/find_barcode.py" "${args[@]}"
