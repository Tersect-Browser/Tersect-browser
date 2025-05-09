#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

###############################################################################
# Usage:  build_trix.sh <outdir> <tsi-location>
###############################################################################
[[ $# == 2 ]] || { echo "Usage: $0 <outdir> <tsi-location>" >&2; exit 1; }
OUTDIR=$1
TSI=$2

for chr_dir in "$OUTDIR"/SL2.50ch*; do
    [[ -d $chr_dir ]] || continue
    chr=$(basename "$chr_dir")         # e.g. SL2.50ch01
    VAR="$chr_dir/variants.txt"

    [[ -s $VAR ]] || { echo "[$chr] variants.txt missing – skip"; continue; }

    ###########################################################################
    # 1. Add a sanitised, comma-separated sample column                      #
    ###########################################################################
    tmp_var=$(mktemp)
    echo "[$chr] adding sample column (via tersect) to variants.txt"

    while IFS=$'\t' read -r chrom pos ref alt info _; do
        key="${chrom}:${pos}:${ref}:${alt}"

        # Build the list:
        #   • drop the header line  (tail -n +2)
        #   • replace dot & space → underscore (sed)
        #   • join ⏎-separated lines with commas (paste -sd, -)
        samples=$(tersect samples "$TSI" -c "$key" \
                 | tail -n +2 \
                 | sed 's/[ .]/_/g' \
                 | paste -sd, -)

        printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
               "$chrom" "$pos" "$ref" "$alt" "$info" "$samples" >>"$tmp_var"
    done <"$VAR"

    mv "$tmp_var" "$VAR"   # atomic overwrite
    ###########################################################################

    ############################
    # 2. Build the trix index  #
    ############################
    chr_num=${chr##SL2.50ch}; chr_num=${chr_num#0}

    TRIX="$chr_dir/${chr}.trix.txt"
    : >"$TRIX"
    echo "[$chr] building $TRIX"

    while IFS=$'\t' read -r chrom pos ref alt info sample; do
        rec_num=${chrom##SL2.50ch}; rec_num=${rec_num#0}

        # ---- chromosome filtering ----
        if   (( rec_num > chr_num )); then
            echo "[$chr] reached $chrom – stopping this file"; break
        elif (( rec_num < chr_num )) && ! (( chr_num == 1 && rec_num == 0 )); then
            continue
        fi
        # ------------------------------

        effBlock=$(grep -o 'EFF=[^;]*' <<<"$info" || true)
        effBlock=${effBlock:-EFF=NA}

        docId="${chrom}:${pos}:${ref}:${alt}|${sample}|${effBlock}"
        coord="${chrom}:${pos}"

        effWords=$(tr '(),|/;:' ' ' <<<"${effBlock#EFF=}")
        sampleWords=$(tr '.,_-:' ' ' <<<"$sample")

        printf '%s\t%s %s %s %s\n' \
               "$docId" "$coord" "$sampleWords" "$effWords" "$effBlock" >>"$TRIX"
    done <"$VAR"

    echo "[$chr] indexing → ${chr}.ix / ${chr}.ixx"
    ixIxx "$TRIX"  "$chr_dir/${chr}.ix"  "$chr_dir/${chr}.ixx"
done

echo "[✓] Finished."