#!/usr/bin/env bash
# Build and start the Tersect Browser development stack.
#
#   ./start_all.sh                       build, seed (first run) and start
#   REBUILD_BASE=1 ./start_all.sh        also rebuild the tersect-base image
#   FORCE=1 ./start_all.sh               re-register the dataset
#   CLEAN=1 ./start_all.sh               wipe the database first
#
# Open http://localhost:4200/TersectBrowserGP/ when it finishes.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="${COMPOSE:-docker compose}"
BASE_IMAGE="tersect-base:latest"
REBUILD_BASE="${REBUILD_BASE:-0}"
CLEAN="${CLEAN:-0}"
FORCE="${FORCE:-0}"

log() { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

docker info >/dev/null 2>&1 || die "Docker is not running."

if [[ ! -f tbconfig.json ]]; then
  log "No tbconfig.json: creating one from tbconfig.example.json"
  cp tbconfig.example.json tbconfig.json
fi
mkdir -p test-data/docker-db test-data/mongo-data test-data/downloads

if [[ "$CLEAN" == "1" ]]; then
  log "CLEAN=1: removing the database"
  $COMPOSE down || true
  rm -rf test-data/docker-db && mkdir -p test-data/docker-db
fi

if [[ "$REBUILD_BASE" == "1" ]] || ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  log "Building $BASE_IMAGE (slow the first time, especially on Apple Silicon)"
  docker buildx build --platform linux/amd64 -t "$BASE_IMAGE" -f Dockerfile.base . --load
fi

log "Building service images"
$COMPOSE --profile init build db_init backend web

log "Starting the database"
$COMPOSE up -d --wait database

log "Creating the application user"
$COMPOSE --profile init run --rm db_user_init

log "Registering the dataset (first run downloads ~300 MB of reference data)"
$COMPOSE --profile init run --rm -e FORCE="$FORCE" db_init

log "Starting backend and frontend"
$COMPOSE up -d backend web

log "Ready: http://localhost:4200/TersectBrowserGP/"
