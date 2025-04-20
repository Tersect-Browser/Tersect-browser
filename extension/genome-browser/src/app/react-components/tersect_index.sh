#!/usr/bin/env bash
################################################################################
#  high_impact_from_tersect_mac.sh
#
#  Extract HIGH‑impact variants (INFO/EFF ⇢ “HIGH”) for a region, starting from
#  a Tersect index and the VariantTrack entries in tracks.json.
#
#  Dependencies:  jq  •  bcftools ≥ 1.9  •  tersect ≥ 0.11  •  awk  •  bgzip/tabix
#
#  Usage:
#    ./high_impact_from_tersect_mac.sh tracks.json variants.tsi REGION [OUT.vcf.gz]
#
#  Example:
#    ./high_impact_from_tersect_mac.sh tracks.json tomato.tsi SL2.50ch02:1-90000
################################################################################
set -euo pipefail

[[ $# -lt 3 ]] && {
  echo "Usage: $0 tracks.json index.tsi REGION [out.vcf.gz]" >&2
  exit 1
}

TRACKS_JSON=$1          # the JSON you showed
TSI=$2                  # Tersect .tsi index
REGION=$3               # e.g. SL2.50ch02:1-90000
OUT=${4:-high_impact.vcf.gz}

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

################################################################################
# 1. Collect all VariantTrack VCF URLs into a simple text file
################################################################################
VCF_LIST_FILE=$WORKDIR/vcf_paths.txt
touch "$VCF_LIST_FILE"
echo "[*] extracting VariantTrack VCFs from $TRACKS_JSON -> $VCF_LIST_FILE"

jq -r '
  .[]                              
  | select(.type=="VariantTrack")         # only variant tracks
  | .adapter.vcfGzLocation.uri // empty   # null → empty string
  | select(length>0)                      # drop empty lines
' "$TRACKS_JSON" > "$VCF_LIST_FILE"

# rewrite the file to itself, dropping blank/whitespace‑only lines
grep -v '^[[:space:]]*$' "$VCF_LIST_FILE" > "${VCF_LIST_FILE}.tmp" \
  && mv "${VCF_LIST_FILE}.tmp" "$VCF_LIST_FILE"


echo "VCF list file is at: $VCF_LIST_FILE"


# cat "$VCF_LIST_FILE"



################################################################################
# 2. Tersect: union of all genomes in the requested region
################################################################################
echo "[*] running Tersect for $REGION"
TERSECT_VCF=$WORKDIR/tersect_raw.vcf
tersect view "$TSI" "u(*)" "$REGION" > "$TERSECT_VCF"



################################################################################
# 3. Build a regional annotation VCF by concatenating the source files
#    (--file-list avoids any bash arrays, Mac‑portable)
################################################################################
echo "[*] merging annotation VCFs by listing each file"
ANNOVCF=$WORKDIR/anno.vcf.gz

# join all lines in VCF_LIST_FILE with spaces
VCF_ARGS=$(paste -sd' ' "$VCF_LIST_FILE")

# now call bcftools merge with each path as a separate argument
bcftools merge $VCF_ARGS \
  --regions "$REGION" \
  --force-samples \
  -m none \
  -O z -o "$ANNOVCF"

# index the result
bcftools index -t "$ANNOVCF"

# 2a. compress & index the skeleton so bcftools annotate can read it
ZTERSECT=$WORKDIR/tersect_raw.vcf.gz
touch "$ZTERSECT"
echo "[*] bgzipping and indexing Tersect output"

bgzip -c "$TERSECT_VCF" > "$ZTERSECT"

tabix -p vcf "$ZTERSECT"

# 3. now annotate using the compressed VCF as the “target”
echo "[*] annotating Tersect output"
ANNOTATED=$WORKDIR/annotated.vcf
touch  "$ANNOTATED"

echo "--------here=-------"
head "$ANNOVCF"

bcftools annotate \
  -a "$ANNOVCF" \
  -c INFO,FORMAT \
  -O v \
  -o "$ANNOTATED" \
  "$ZTERSECT"

################################################################################
# 5. Keep only HIGH‑impact variants
################################################################################
echo "[*] filtering for HIGH‑impact variants"
bcftools view \
        -i 'INFO/EFF~"HIGH"' \
        -O z -o "$OUT" \
        "$ANNOTATED"
bcftools index "$OUT"

echo "[✓] done — results in $OUT"
