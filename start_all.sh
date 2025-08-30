#!/usr/bin/env bash
set -euo pipefail

# -------- configurable knobs --------
COMPOSE="${COMPOSE:-docker compose}"          # or docker-compose
DB_SERVICE=database
USER_INIT_SERVICE=db_user_init
SEED_SERVICE=db_init
APP_SERVICES=("backend" "frontend" "extension")

# Base image (built locally so FROM tersect-base works without pulling)
BASE_IMAGE_NAME="${BASE_IMAGE_NAME:-tersect-base:latest}"
BASE_CONTEXT="${BASE_CONTEXT:-./}"
BASE_DOCKERFILE="${BASE_DOCKERFILE:-$BASE_CONTEXT/Dockerfile.base}"
BASE_PLATFORM="${BASE_PLATFORM:-linux/amd64}"

# Data dir bind-mounted for Mongo
DATA_DIR="${DATA_DIR:-./test-data/mongo-data}"

# Behavior flags
CLEAN="${CLEAN:-0}"                 # CLEAN=1 wipes DB files before start
REBUILD_BASE="${REBUILD_BASE:-0}"   # REBUILD_BASE=1 to force rebuilding tersect-base
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"  # seconds to wait for DB healthy
PRUNE="${PRUNE:-0}"                 # PRUNE=1 to prune buildx + dangling caches before builds
# ------------------------------------

log()  { printf "\033[1;32m[+]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[x]\033[0m %s\n" "$*" >&2; }

die() {
  err "$*"
  $COMPOSE logs --tail=200 ${DB_SERVICE} || true
  exit 1
}

check_docker() {
  if ! docker info >/dev/null 2>&1; then
    die "Docker is not running or not accessible."
  fi
}

have_image() {
  docker image inspect "$1" >/dev/null 2>&1
}

prune_caches_if_requested() {
  if [[ "$PRUNE" = "1" ]]; then
    warn "PRUNE=1 → pruning build caches (buildx + system danglings)…"
    docker buildx prune -af || true
    docker system prune -af || true
  fi
}

ensure_base_image() {
  if [[ "$REBUILD_BASE" = "1" ]] || ! have_image "$BASE_IMAGE_NAME"; then
    log "Building base image '$BASE_IMAGE_NAME' from $BASE_DOCKERFILE (context: $BASE_CONTEXT)…"
    docker buildx build \
      --platform "$BASE_PLATFORM" \
      -t "$BASE_IMAGE_NAME" \
      -f "$BASE_DOCKERFILE" \
      "$BASE_CONTEXT" \
      --load
    log "Base image '$BASE_IMAGE_NAME' ready."
  else
    log "Base image '$BASE_IMAGE_NAME' already present; skipping build."
  fi
}

wipe_db_if_requested() {
  if [[ "$CLEAN" = "1" ]]; then
    warn "CLEAN=1 → stopping stack and wiping ${DATA_DIR}/*"
    $COMPOSE down || true
    rm -rf "${DATA_DIR:?}/"* || true
  fi
}

ensure_paths() {
  mkdir -p "$DATA_DIR"
}

wait_for_health() {
  local svc="$1" timeout="$2"
  local id; id="$($COMPOSE ps -q "$svc")"
  if [[ -z "$id" ]]; then die "No container ID for service '$svc'"; fi

  log "Waiting for '$svc' to be healthy (timeout ${timeout}s)…"
  local start now status
  start=$(date +%s)
  while :; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" ]]; then
      log "'$svc' is healthy."
      return 0
    fi
    now=$(date +%s)
    if (( now - start > timeout )); then
      die "'$svc' did not become healthy in ${timeout}s (last status: ${status})."
    fi
    sleep 2
  done
}

classic_compose_build() {
  # Force classic builder so Compose uses local images by tag and skips remote digest resolution
  DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 \
  $COMPOSE build "$@"
}

build_dependents() {
  log "Building services that depend on 'tersect-base:latest'…"
  classic_compose_build db_init backend || die "Compose build failed."
}

main() {
  check_docker
  prune_caches_if_requested
  ensure_paths
  wipe_db_if_requested

  # Make sure the local amd64 base exists
  ensure_base_image

  # Build the services that use FROM tersect-base using the classic builder
  build_dependents

  # 1) Start DB
  log "Starting ${DB_SERVICE}…"
  $COMPOSE up -d "${DB_SERVICE}"

  # 2) Wait for health
  wait_for_health "${DB_SERVICE}" "${HEALTH_TIMEOUT}"

  # 3) Create Mongo user (one-shot)
  log "Creating DB user via ${USER_INIT_SERVICE}…"
  $COMPOSE --profile init up --abort-on-container-exit "${USER_INIT_SERVICE}"

  # 4) Run seeding job
  log "Running data seed via ${SEED_SERVICE}…"
  $COMPOSE --profile init up --abort-on-container-exit "${SEED_SERVICE}"

  # 5) Start app services
  if ((${#APP_SERVICES[@]})); then
    log "Starting app services: ${APP_SERVICES[*]}…"
    $COMPOSE up -d "${APP_SERVICES[@]}"
  fi

  log "✅ All done."
}

main "$@"
