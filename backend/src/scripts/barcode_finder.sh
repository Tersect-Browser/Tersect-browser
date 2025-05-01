#!/bin/bash

# Usage: ./barcode_finder.sh "S.gal W TS-208" SL2.50ch07 1 2000 reference.fasta SGN_aer_hom_snps.tsi

# Set the python script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

ACCESSION="$1"
CHROM="$2"
START="$3"
END="$4"
SIZE="$5"
VAR="$6"
FASTA="$7"
TSI="$8"


REGION="${CHROM}:${START}-${END}"
SAFE_ACC=$(echo "$ACCESSION" | sed "s/ /_/g")
mkdir -p tmp_outputs

echo "calling tersect"
# Variant list for this accession
tersect view "$TSI" "'$ACCESSION'" "$REGION" > tmp_outputs/${SAFE_ACC}_acc_unique.tsv

# Private (unique) variants
tersect view "$TSI" "u(*) ^ '$ACCESSION'" "$REGION" > tmp_outputs/${SAFE_ACC}_union_vars.tsv

echo "calling python script"

echo "here is passed max variants argument: ${VAR}"

if [ "${VAR}" != "null" ]; then
  echo "max variants is not null - will call python with var arg: ${VAR}"
  python3 "$SCRIPT_DIR/find_barcode.py" \
  --accession "$ACCESSION" \
  --fasta "$FASTA" \
  --chrom "$CHROM" \
  --start "$START" \
  --end "$END" \
  --size "$SIZE" \
  --unique_variants tmp_outputs/${SAFE_ACC}_acc_unique.tsv \
  --union_variants tmp_outputs/${SAFE_ACC}_union_vars.tsv \
  --max_variants "${VAR}"
else
  echo "max variants is null - will call python without var arg: ${VAR}"
  python3 "$SCRIPT_DIR/find_barcode.py" \
  --accession "$ACCESSION" \
  --fasta "$FASTA" \
  --chrom "$CHROM" \
  --start "$START" \
  --end "$END" \
  --size "$SIZE" \
  --unique_variants tmp_outputs/${SAFE_ACC}_acc_unique.tsv \
  --union_variants tmp_outputs/${SAFE_ACC}_union_vars.tsv
fi

# Run barcode finder
# python3 "$SCRIPT_DIR/find_barcode.py" \
#   --accession "$ACCESSION" \
#   --fasta "$FASTA" \
#   --chrom "$CHROM" \
#   --start "$START" \
#   --end "$END" \
#   --size "$SIZE" \
#   --unique_variants tmp_outputs/${SAFE_ACC}_acc_unique.tsv \
#   --union_variants tmp_outputs/${SAFE_ACC}_union_vars.tsv \
#   --max_variants 4
