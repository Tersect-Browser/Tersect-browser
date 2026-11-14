#!/usr/bin/env bash
# Registers a dataset in the database and prepares its genome browser files.
# Configured with environment variables (defaults: the bundled soybean data):
#
#   DATASET_ID           dataset name shown in the browser
#   DATASET_TSI          Tersect index (.tsi)
#   REFERENCE_ID         reference genome id
#   REFERENCE_FASTA      reference FASTA (optional; plain, gzip or bgzip)
#   REFERENCE_FASTA_URL  where to download REFERENCE_FASTA if it is missing
#   GENE_MODELS          gene models GFF3 (optional)
#   GENE_MODELS_URL      where to download GENE_MODELS if it is missing
#   VARIANTS             "tsi": one variant track per accession from the index;
#                        a directory: one track per *.vcf.gz in it; "none"
#   FORCE                1 to replace an existing dataset of the same name
#
# Database and data paths come from TB_MONGO_HOST, TB_DB_NAME and
# TB_LOCAL_DB_PATH, which override tbconfig.json.
set -euo pipefail

CONFIG="${CONFIG:-/app/tbconfig.json}"
SCRIPTS=/app/backend/src/scripts
DATASET_ID="${DATASET_ID:?DATASET_ID is required}"
DATASET_TSI="${DATASET_TSI:?DATASET_TSI is required}"
REFERENCE_ID="${REFERENCE_ID:?REFERENCE_ID is required}"
VARIANTS="${VARIANTS:-tsi}"
FORCE="${FORCE:-0}"

log() { printf '[db_init] %s\n' "$*"; }

fetch() { # file url
  local file="$1" url="${2:-}"
  if [[ -n "$file" && ! -s "$file" && -n "$url" ]]; then
    log "Downloading $(basename "$file")..."
    mkdir -p "$(dirname "$file")"
    curl -fL --retry 3 -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
}

registered() {
  python3 - "$CONFIG" "$DATASET_ID" <<'PY'
import sys
sys.path.insert(0, "/app/backend/src/scripts")
from pymongo import MongoClient
from tbutils import load_config
cfg = load_config(sys.argv[1])
client = MongoClient(cfg["mongoHost"])
found = client[cfg["dbName"]]["datasets"].find_one({"_id": sys.argv[2]})
sys.exit(0 if found else 1)
PY
}

if registered && [[ "$FORCE" != "1" ]]; then
  log "Dataset '$DATASET_ID' is already registered (set FORCE=1 to rebuild)."
  exit 0
fi

fetch "${REFERENCE_FASTA:-}" "${REFERENCE_FASTA_URL:-}"
fetch "${GENE_MODELS:-}" "${GENE_MODELS_URL:-}"

log "Registering '$DATASET_ID' and building its distance index..."
add_args=("$CONFIG" "$DATASET_ID" "$DATASET_TSI" "$REFERENCE_ID")
[[ "$FORCE" == "1" ]] && add_args+=(-f)
python3 "$SCRIPTS/add_dataset.py" "${add_args[@]}"

if [[ -n "${REFERENCE_FASTA:-}" && -s "$REFERENCE_FASTA" ]]; then
  log "Preparing genome browser files..."
  prep_args=("$CONFIG" "$DATASET_ID" --fasta "$REFERENCE_FASTA"
             --reference-id "$REFERENCE_ID")
  [[ -n "${GENE_MODELS:-}" && -s "$GENE_MODELS" ]] && prep_args+=(--gff "$GENE_MODELS")
  if [[ "$VARIANTS" == "tsi" ]]; then
    prep_args+=(--variants-from-tsi)
  elif [[ -d "$VARIANTS" ]]; then
    for vcf in "$VARIANTS"/*.vcf.gz; do prep_args+=(--vcf "$vcf"); done
  fi
  python3 "$SCRIPTS/prepare_genome_browser.py" "${prep_args[@]}"
else
  log "No reference FASTA: skipping the genome browser (chromosomes come from the index)."
fi

log "Done."
