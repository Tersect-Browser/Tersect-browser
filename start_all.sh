#!/usr/bin/env bash
# Build and start the Tersect Browser development stack.
#
#   ./start_all.sh                       build, load datasets, start
#   REBUILD_BASE=1 ./start_all.sh        also rebuild the tersect-base image
#   DATASETS="datasets/x.yaml" ./start_all.sh   which manifests to build
#   FORCE=1 ./start_all.sh               rebuild datasets from scratch
#   CLEAN=1 ./start_all.sh               wipe the databases first
#   DATASETS="" ./start_all.sh           skip the dataset builds
#   ASSISTANT=0 ./start_all.sh           don't start the dataset assistant
#
# The dataset assistant runs on a local model. On a Mac this script starts
# Ollama natively (Docker has no GPU there), bound to localhost, and pulls the
# model the first time (qwen3:14b, ~9 GB; TB_ASSISTANT_MODEL to change it, e.g.
# qwen3:8b on a busier machine). On a 16 GB Mac this needs Docker's memory cap
# at about 6 GB, since the model runs outside Docker, and an 8k context.
# mistral:7b was tried and calls tools far less reliably.
# Stop it with:  kill "$(cat test-data/ollama.pid)"
# Elsewhere, set TB_ASSISTANT_URL to an OpenAI-compatible endpoint yourself
# (e.g. Ollama or vLLM on a GPU server). The model and Docker together need
# most of a 16 GB machine.
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
# DATASETS="" builds none (an empty value is not replaced by the default).
DATASETS="${DATASETS-datasets/soybean-hn.yaml datasets/tomato-sl250.yaml}"
ASSISTANT="${ASSISTANT:-1}"
export TB_ASSISTANT_MODEL="${TB_ASSISTANT_MODEL:-qwen3:14b}"
# Model context (tokens) and the assistant's prompt budget (characters) go
# together: about 14,000 characters of conversation fit an 8k context with the
# tools and the answer. Raise both on a machine with more memory.
OLLAMA_CONTEXT="${OLLAMA_CONTEXT_LENGTH:-8192}"
export TB_ASSISTANT_CONTEXT_CHARS="${TB_ASSISTANT_CONTEXT_CHARS:-14000}"
OLLAMA_URL="http://127.0.0.1:11434"

log() { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# Start Ollama on this Mac (if it isn't running) and make sure the model is
# there; sets TB_ASSISTANT_URL for the builder. Problems only skip the assistant.
start_assistant() {
  if [[ -n "${TB_ASSISTANT_URL:-}" ]]; then
    log "Assistant: using TB_ASSISTANT_URL=$TB_ASSISTANT_URL"
    return
  fi
  if [[ "$(uname)" != "Darwin" ]]; then
    warn "Assistant off: set TB_ASSISTANT_URL to your model server (see pipeline/README.md)"
    return
  fi
  local ollama
  ollama="$(command -v ollama || true)"
  [[ -z "$ollama" && -x /opt/homebrew/bin/ollama ]] && ollama=/opt/homebrew/bin/ollama
  if [[ -z "$ollama" ]]; then
    warn "Assistant off: Ollama is not installed (brew install ollama)"
    return
  fi
  if ! curl -sf -m 2 "$OLLAMA_URL/api/version" >/dev/null; then
    log "Starting Ollama (localhost only; log in test-data/ollama.log)"
    # The q8 cache halves the context's memory.
    OLLAMA_CONTEXT_LENGTH="$OLLAMA_CONTEXT" \
    OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
      nohup "$ollama" serve >test-data/ollama.log 2>&1 &
    echo $! >test-data/ollama.pid
    for _ in $(seq 1 30); do
      curl -sf -m 2 "$OLLAMA_URL/api/version" >/dev/null && break
      sleep 1
    done
    if ! curl -sf -m 2 "$OLLAMA_URL/api/version" >/dev/null; then
      warn "Assistant off: Ollama did not start (see test-data/ollama.log)"
      return
    fi
  else
    log "Ollama is already running (its own settings apply; it needs a context of at least $OLLAMA_CONTEXT)"
  fi
  if ! "$ollama" list | awk 'NR>1 {print $1}' | grep -qx "$TB_ASSISTANT_MODEL"; then
    log "Downloading the model $TB_ASSISTANT_MODEL (once; qwen3:14b is ~9 GB)"
    "$ollama" pull "$TB_ASSISTANT_MODEL" || { warn "Assistant off: could not pull $TB_ASSISTANT_MODEL"; return; }
  fi
  # Docker Desktop routes host.docker.internal to the Mac's localhost.
  export TB_ASSISTANT_URL="http://host.docker.internal:11434/v1"
  log "Assistant: $TB_ASSISTANT_MODEL via Ollama"
}

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
# The builder service runs the pipeline image.
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

[[ "$ASSISTANT" == "1" ]] && start_assistant

log "Starting backend, builder (uploads and builds) and frontend"
# Recreated so it picks up TB_ASSISTANT_URL (or its absence).
$COMPOSE up -d --force-recreate builder
$COMPOSE up -d backend web

if curl -sf -m 10 --retry 5 --retry-connrefused http://127.0.0.1:4310/api/config | grep -q '"assistant":true'; then
  if [[ -f test-data/ollama.pid ]] && kill -0 "$(cat test-data/ollama.pid)" 2>/dev/null; then
    log "Assistant on. Stop the model with: kill \"\$(cat test-data/ollama.pid)\""
  else
    log "Assistant on"
  fi
fi
log "Ready: http://localhost:4200/TersectBrowserGP/"
