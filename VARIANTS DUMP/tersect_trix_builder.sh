#!/usr/bin/env bash
#
# tersect_trix_builder.sh  <outdir>
#
# docId carries  CHR:POS:REF:ALT | SAMPLE | full EFF=
# Searchable text contains CHR:POS, tokenised SAMPLE and EFF words.
# ----------------------------------------------------------------------

set -euo pipefail
IFS=$'\n\t'

[[ $# == 1 ]] || { echo "Usage: $0 <outdir>" >&2; exit 1; }
OUTDIR=$1

for chr_dir in "$OUTDIR"/SL2.50ch*; do
    [[ -d $chr_dir ]] || continue
    chr=$(basename "$chr_dir")            # e.g. SL2.50ch01
    VAR="$chr_dir/variants_with_acc.txt"

    [[ -s $VAR ]] || { echo "[$chr] variants_with_acc.txt missing – skip"; continue; }

    # numeric chromosome (00→0, 01→1, 10→10 …)
    chr_num=${chr##SL2.50ch}; chr_num=${chr_num#0}

    TRIX="$chr_dir/${chr}.trix.txt"; : >"$TRIX"
    echo "[$chr] building $TRIX"

    while IFS=$'\t' read -r chrom pos ref alt info sample; do
        # derive numeric value of this record’s chromosome
        rec_num=${chrom##SL2.50ch}; rec_num=${rec_num#0}

        # --- filtering rules ------------------------------------------------
        if   (( rec_num > chr_num )); then
            echo "[$chr] reached $chrom – stopping this file"; break
        elif (( rec_num < chr_num )); then
            # keep only ch00 in ch01; otherwise skip and continue
            if ! (( chr_num == 1 && rec_num == 0 )); then
                continue
            fi
        fi
        # --------------------------------------------------------------------

        effBlock=$(grep -o 'EFF=[^;]*' <<<"$info" || true)
        effBlock=${effBlock:-EFF=NA}
        docId="${chrom}:${pos}:${ref}:${alt}|${sample}|${effBlock}"

        coord="${chrom}:${pos}"
        effWords=$(tr '(),|/;:' ' ' <<<"${effBlock#EFF=}")
        sampleWords=$(tr '._-:' ' ' <<<"$sample")

        printf '%s\t%s %s %s %s\n' \
               "$docId" "$coord" "$sampleWords" "$effWords" "$effBlock" >>"$TRIX"
    done <"$VAR"

    echo "[$chr] indexing → ${chr}.ix / ${chr}.ixx"
    ixIxx "$TRIX"  "$chr_dir/${chr}.ix"  "$chr_dir/${chr}.ixx"
done

echo "[✓] Finished."