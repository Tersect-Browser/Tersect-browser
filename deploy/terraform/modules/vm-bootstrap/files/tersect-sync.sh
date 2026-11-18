#!/bin/bash
# Brings the stack in /opt/tersect in line with the configuration bundle in
# the secret store.
#
#   tersect-sync          act only when the bundle changed since the last
#                         successful run (the timer runs this)
#   tersect-sync --boot   always (re)start the stack (tersect.service)
#
# A run that fails leaves no mark, so the next timer tick tries again; that
# is how a machine started before its images were pushed recovers.
set -euo pipefail

# shellcheck source=/dev/null
. /etc/tersect/deploy.env
# shellcheck source=/dev/null
. /usr/local/lib/tersect/cloud.sh

export HOME="${HOME:-/root}"
APP_DIR=/opt/tersect
DATA_DIR="$TERSECT_DATA_DIR"
APPLIED="$APP_DIR/.applied-bundle.sha256"
mode="${1:-}"

log() { echo "[tersect-sync] $*"; }

compose() { docker compose --project-directory "$APP_DIR" "$@"; }

env_value() {
    # Value of one KEY=value line of the .env file.
    sed -n "s/^$1=//p" "$APP_DIR/.env" | tail -n 1
}

site_config_hash() {
    if [ -d "$APP_DIR/site.d" ]; then
        find "$APP_DIR/site.d" -type f -name '*.caddy' -print0 | sort -z | xargs -0 -r cat | sha256sum | cut -d' ' -f1
    fi
}

# One run at a time. The boot run waits; a timer run gives way.
exec 9> /run/tersect-sync.lock
if [ "$mode" = "--boot" ]; then
    flock 9
elif ! flock -n 9; then
    log "another run is in progress"
    exit 0
fi

mountpoint -q "$DATA_DIR" || { log "ERROR: $DATA_DIR is not mounted; not starting"; exit 1; }

# --- Fetch the bundle --------------------------------------------------------

bundle=$(mktemp)
trap 'rm -f "$bundle"' EXIT
chmod 600 "$bundle"

changed=0
checksum=""
if cloud_fetch_bundle > "$bundle" && [ -s "$bundle" ]; then
    checksum=$(sha256sum < "$bundle" | cut -d' ' -f1)
    if [ "$checksum" != "$(cat "$APPLIED" 2>/dev/null || true)" ]; then
        changed=1
    fi
elif [ -f "$APP_DIR/.env" ]; then
    log "could not fetch the configuration; continuing with the one on disk"
else
    log "ERROR: could not fetch the configuration and there is none on disk"
    exit 1
fi

if [ "$changed" -eq 0 ] && [ "$mode" != "--boot" ]; then
    exit 0
fi

# --- Apply -------------------------------------------------------------------

site_before=$(site_config_hash)
if [ "$changed" -eq 1 ]; then
    log "applying configuration $checksum"
    # From here until the end of a successful run the disk matches no applied
    # bundle; without the mark every later run starts over, also when the
    # bundle goes back to the previous one.
    rm -f "$APPLIED"
    python3 /usr/local/lib/tersect/unpack.py "$bundle" "$APP_DIR"
fi
site_after=$(site_config_hash)

if [ "$mode" = "--boot" ]; then
    # Picks up a data disk that was enlarged; does nothing otherwise.
    resize2fs "$(findmnt -no SOURCE "$DATA_DIR")" >/dev/null 2>&1 || log "could not grow the file system on $DATA_DIR"
fi
mkdir -p "$DATA_DIR"/{tersect,shared,mongo,clickhouse,caddy,ollama}

assistant=0
case ",$(env_value COMPOSE_PROFILES)," in
    *,assistant,*) assistant=1 ;;
esac

if [ "$assistant" -eq 1 ]; then
    /usr/local/lib/tersect/gpu.sh
fi

cloud_registry_login || log "registry login failed; pulling may fail"

if [ "$changed" -eq 1 ]; then
    compose pull --quiet
fi
compose up -d --remove-orphans

# The proxy reads site.d only when it starts.
if [ -n "$site_before" ] && [ "$site_before" != "$site_after" ]; then
    log "access control changed; restarting the proxy"
    compose up -d --no-deps --force-recreate web
fi

if [ "$assistant" -eq 1 ]; then
    model=$(env_value TB_ASSISTANT_MODEL)
    log "making sure the model $model is present"
    compose exec -T ollama ollama pull "$model"
fi

if [ -n "$checksum" ]; then
    echo "$checksum" > "$APPLIED"
fi
if [ "$changed" -eq 1 ]; then
    # Everything the stack needs is in use by now; drop the previous release.
    docker image prune -af >/dev/null 2>&1 || true
fi
log "the stack is up"
