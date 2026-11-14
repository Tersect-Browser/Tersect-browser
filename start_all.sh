#!/usr/bin/env bash
# Build and start the Tersect Browser development stack.
#
#   ./start_all.sh                       build, load datasets, start
#   REBUILD_BASE=1 ./start_all.sh        also rebuild the tersect-base image
#   DATASETS="datasets/x.yaml" ./start_all.sh   which manifests to build
#   FORCE=1 ./start_all.sh               rebuild datasets from scratch
#   CLEAN=1 ./start_all.sh               wipe the databases first
#
# Datasets are built by the pipeline (pipeline/README.md); an unchanged,
# already built dataset is skipped.
#
# Open http://localhost:4200/TersectBrowserGP/ when it finishes.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="${COMPOSE:-docker compose}"
BASE_IMAGE="tersect-base:latest"
REBUILD_BASE="${REBUILD_BASE:-0}"
CLEAN="${CLEAN:-0}"
FORCE="${FORCE:-0}"
DATASETS="${DATASETS:-datasets/soybean-hn.yaml datasets/tomato-sl250.yaml}"

log() { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

docker info >/dev/null 2>&1 || die "Docker is not running."

if [[ ! -f tbconfig.json ]]; then
  log "No tbconfig.json: creating one from tbconfig.example.json"
  cp tbconfig.example.json tbconfig.json
fi
mkdir -p test-data/docker-db test-data/mongo-data test-data/clickhouse test-data/datasets

if [[ "$CLEAN" == "1" ]]; then
  log "CLEAN=1: removing the database"
  $COMPOSE down || true
  rm -rf test-data/docker-db test-data/clickhouse
  mkdir -p test-data/docker-db test-data/clickhouse
fi

if [[ "$REBUILD_BASE" == "1" ]] || ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  log "Building $BASE_IMAGE (slow the first time, especially on Apple Silicon)"
  docker buildx build --platform linux/amd64 -t "$BASE_IMAGE" -f Dockerfile.base . --load
fi

log "Building service images"
$COMPOSE --profile pipeline build pipeline backend web

log "Starting the databases"
$COMPOSE up -d --wait database clickhouse

log "Creating the application user"
$COMPOSE --profile init run --rm db_user_init

for manifest in $DATASETS; do
  log "Building dataset $manifest (the first build downloads its inputs)"
  args=(build "$manifest")
  [[ "$FORCE" == "1" ]] && args+=(--force)
  ./scripts/dataset "${args[@]}"
done

log "Starting backend and frontend"
$COMPOSE up -d backend web

log "Ready: http://localhost:4200/TersectBrowserGP/"
