#!/usr/bin/env bash
#------------------------------------------------------------------------------
# build_annotate_per_chrom.sh
#  Author: David Oluwasusi 26/04/2025
#  Merge all sanitized VCFs once, then per-chromosome:
#   • union via Tersect
#   • annotate via bcftools against all_samples.vcf.gz (with regions)
#   • extract HIGH impact variants to a file - ONLY necessary for building trix index
#  Parallelized: 3 cores/job, smallest-first.
#  All temp files are kept under $OUTDIR.
#
#  Usage:
#    build_annotate_per_chrom.sh tracks.json index.tsi genes.gff3.gz [outdir]
#
set -euo pipefail
IFS=$'\n\t'

if (( $# < 3 )); then
  echo "Usage: $0 tracks.json index.tsi genes.gff3.gz [outdir]" >&2
  exit 1
fi

TRACKS_JSON=$1
TSI=$2
OUTDIR=${4:-.}
mkdir -p "$OUTDIR"

################################################################################
# 1) Collect VariantTrack VCF URIs & sample names
################################################################################
VCF_LIST="$OUTDIR/vcf_list.txt"
jq -r '
  .[] 
  | select(.type=="VariantTrack")
  | .adapter.vcfGzLocation.uri
  | select(length>0)
' "$TRACKS_JSON" > "$VCF_LIST"

VCF_FILES=()
SAMPLE_NAMES=()
while IFS= read -r vf; do
  VCF_FILES+=( "$vf" )
  SAMPLE_NAMES+=( "$(basename "$vf" .vcf.gz.snpeff.vcf.gz)" )
done < "$VCF_LIST"

(( ${#VCF_FILES[@]} > 0 )) || {
  echo "No VariantTrack VCFs found!" >&2
  exit 1
}

################################################################################
# 2) Idempotent sanitization → OUTDIR/sanitized_vcfs
################################################################################
SANIT_OUT="$OUTDIR/sanitized_vcfs"
mkdir -p "$SANIT_OUT"
SANIT_VCFS=()

echo "[*] Sanitizing VCFs → $SANIT_OUT"
for i in "${!VCF_FILES[@]}"; do
  vf="${VCF_FILES[i]}"
  sm="${SAMPLE_NAMES[i]}"
  clean="$SANIT_OUT/${sm}.sanitized.vcf.gz"

  if [[ -s "$clean" && -s "${clean}.tbi" ]]; then
    echo "  ➜ reuse $sm"
  else
    echo "  ➜ sanitize $sm"
    bcftools view -G -Oz -o "$clean" "$vf"
    tabix -p vcf "$clean"
  fi

  SANIT_VCFS+=( "$clean" )
done

################################################################################
# 2a) Merge all sanitized VCFs once into all_samples.vcf.gz
################################################################################

NCPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc || echo 1)
NVFILES=${#SANIT_VCFS[@]}   # how many VCFs do we actually have?

echo "[*] Found $NVFILES sanitized VCF file(s)"

if [[ $NVFILES -gt 1 ]]; then
  echo "[*] Merging all sanitized VCFs → $OUTDIR/all_samples.vcf.gz"

  bcftools merge \
    --threads "$NCPU" \
    --force-samples -m none \
    -Oz -o "$OUTDIR/all_samples.vcf.gz" \
    "${SANIT_VCFS[@]}"

  tabix -p vcf "$OUTDIR/all_samples.vcf.gz"

else
  echo "[*] Only one VCF – no merge needed. Renaming to all_samples.vcf.gz"

  # Move (or use cp if you prefer to keep the original)
  mv "${SANIT_VCFS[0]}" "$OUTDIR/all_samples.vcf.gz"

  # If it already has a tabix index, move that too; else create one
  if [[ -f "${SANIT_VCFS[0]}.tbi" ]]; then
    mv "${SANIT_VCFS[0]}.tbi" "$OUTDIR/all_samples.vcf.gz.tbi"
  else
    tabix -p vcf "$OUTDIR/all_samples.vcf.gz"
  fi
fi

################################################################################
# 3) Parse chromosomes
################################################################################
echo "[*] tersect chroms $TSI"
tersect chroms "$TSI" > "$OUTDIR/chroms_raw.txt"

tail -n +2 "$OUTDIR/chroms_raw.txt" \
  | sed '/^[[:space:]]*$/d' \
  | awk '{print $1, $2}' \
  > "$OUTDIR/chroms.txt"

echo "[*] chromosomes:"
sed 's/^/    /' "$OUTDIR/chroms.txt"

################################################################################
# 4) Define per-chromosome worker
################################################################################
build_chr(){
  CHR="$1"
  CHR_LEN="$2"
  CHR_DIR="$OUTDIR/$CHR"
  REGION="${CHR}:1-${CHR_LEN}"
  UNION_VCF="$CHR_DIR/union.vcf.gz"
  ANNOT_VCF="$CHR_DIR/union.ann.vcf.gz"
  VAR_TMP="$CHR_DIR/variants.txt"
  TRIX_IN="$CHR_DIR/${CHR}.trix.txt"

  mkdir -p "$CHR_DIR"
  true > "$TRIX_IN"
  true > "$VAR_TMP"

  echo "[$CHR] START $REGION"

  # 1) union
  echo "[$CHR] 1) union"
  tersect view "$TSI" 'u(*)' "$REGION" \
    > "$CHR_DIR/union.vcf"
  bgzip -c "$CHR_DIR/union.vcf" > "$UNION_VCF"
  tabix -p vcf "$UNION_VCF"

  # 2) annotate via all_samples
  echo "[$CHR] 2) annotate union"
  bcftools annotate -a "$OUTDIR/all_samples.vcf.gz" -c INFO  --regions "$REGION" -Oz -o "$ANNOT_VCF" "$UNION_VCF" 

  tabix -p vcf "$ANNOT_VCF" || true

  # 3) extract HIGH|MODERATE|LOW
  echo "[$CHR] 3) dump impacts"
  bcftools query -i 'INFO/EFF~"HIGH"' -f '%CHROM\t%POS\t%REF\t%ALT\t%INFO\n' "$OUTDIR/all_samples.vcf.gz" "$ANNOT_VCF" > "$VAR_TMP"


  echo "[$CHR] DONE"
}

################################################################################
# 5) Parallel dispatch (3 cores/job, smallest-first)
################################################################################
NCPU=$(sysctl -n hw.ncpu || echo 1)
MAX_JOBS=$(( NCPU/3 )); (( MAX_JOBS<1 )) && MAX_JOBS=1

sort -k2,2n "$OUTDIR/chroms.txt" > "$OUTDIR/chroms_sorted.txt"

echo "[*] Parallel build: 3 cores/job → max $MAX_JOBS jobs"
PIDS=()

while IFS=' ' read -r CHR CHR_LEN; do
  echo "[*] launch $CHR"
  build_chr "$CHR" "$CHR_LEN" &  
  PIDS+=( "$!" )
  while (( $(jobs -pr | wc -l) >= MAX_JOBS )); do
    sleep 1
  done
done < "$OUTDIR/chroms_sorted.txt"

# wait & abort on any failure
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    echo "[ERROR] job $pid failed — aborting" >&2
    exit 1
  fi
done

echo "[✓] All  indices in $OUTDIR"















