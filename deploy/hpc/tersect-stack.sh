#!/usr/bin/env bash
# Tersect Browser on an HPC node: the production stack (deploy/compose) run as
# Apptainer containers by an ordinary user, everything on localhost.
#
#   tersect-stack.sh pull [--force]   fetch the images as SIF files (needs internet)
#   tersect-stack.sh submit           queue the Slurm job (tersect.sbatch)
#   tersect-stack.sh status           job, node, services and the SSH tunnel command
#   tersect-stack.sh wait [seconds]   wait until the job reports the stack as up
#   tersect-stack.sh cancel           stop the job cleanly; data is kept
#
# Used by the job, or by hand on the node the stack should run on:
#
#   tersect-stack.sh start            start the services (returns once they are up)
#   tersect-stack.sh check            exit 1 if a service has died
#   tersect-stack.sh stop             stop the services, databases first asked nicely
#   tersect-stack.sh render           write run/ (configuration) without starting
#
# The deployment directory is the directory this script is in (or
# TB_DEPLOY_DIR). It holds stack.env (settings), secrets.env (passwords, mode
# 0600), config/, and what this script creates: images/, run/, logs/ and,
# unless TB_DATA_DIR points elsewhere, data/. See README.md.
set -euo pipefail
umask 077

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=${TB_DEPLOY_DIR:-$SELF_DIR}
RUN_DIR=$DEPLOY_DIR/run
LOG_DIR=$DEPLOY_DIR/logs
IMAGE_DIR=$DEPLOY_DIR/images
CONFIG_DIR=$DEPLOY_DIR/config
HOST=${SLURMD_NODENAME:-$(hostname)}

CLICKHOUSE_ADMIN_USER=tersect_admin
CLICKHOUSE_READER_USER=tersect_reader
MONGO_ROOT_USER=root

log()  { printf '[tersect %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[tersect %s] WARNING: %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
die()  { printf '[tersect %s] ERROR: %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }

# --- Settings ----------------------------------------------------------------

load_config() {
    [ -f "$DEPLOY_DIR/stack.env" ] || die "No stack.env in $DEPLOY_DIR (copy stack.env.example and fill it in)."
    # shellcheck source=/dev/null
    . "$DEPLOY_DIR/stack.env"
    if [ -f "$DEPLOY_DIR/secrets.env" ]; then
        chmod 600 "$DEPLOY_DIR/secrets.env"
        # shellcheck source=/dev/null
        . "$DEPLOY_DIR/secrets.env"
    fi

    : "${TB_NAME:=tersect}"
    : "${TB_APPTAINER:=apptainer}"
    : "${TB_MODULES:=}"
    : "${TB_APPTAINER_FLAGS=--containall --no-home}"
    : "${TB_IMAGE_WEB:=}" "${TB_IMAGE_BACKEND:=}" "${TB_IMAGE_PIPELINE:=}"
    : "${TB_IMAGE_MONGO:=mongo:8.0}"
    : "${TB_IMAGE_CLICKHOUSE:=clickhouse/clickhouse-server:25.8}"
    : "${TB_IMAGE_OLLAMA:=ollama/ollama:0.40.16}"
    : "${TB_DATA_DIR:=$DEPLOY_DIR/data}"
    : "${TB_SHARED_DIR:=$TB_DATA_DIR/shared}"
    : "${TB_NODE_LOCAL_DIR:=}"
    : "${TB_BIND_ADDRESS:=127.0.0.1}"
    : "${TB_HTTP_PORT:=8080}"
    : "${TB_BACKEND_PORT:=14300}"
    : "${TB_BUILDER_PORT:=14310}"
    : "${TB_MONGO_PORT:=27117}"
    : "${TB_CLICKHOUSE_HTTP_PORT:=18123}"
    : "${TB_CLICKHOUSE_TCP_PORT:=19000}"
    : "${TB_OLLAMA_PORT:=21434}"
    : "${TB_TUNNEL_LOCAL_PORT:=8080}"
    : "${TB_PUBLIC_URL:=http://localhost:$TB_TUNNEL_LOCAL_PORT}"
    : "${TB_SSH_LOGIN:=}"
    : "${TB_SSH_PORT:=22}"
    : "${TB_DB_NAME:=tersect_browser_gp}"
    : "${TB_MONGO_USER:=tersect}"
    : "${TB_MONGO_CACHE_GB:=1}"
    : "${TB_BASIC_AUTH_USER:=tersect}"
    : "${TB_CLICKHOUSE_LOW_MEMORY:=1}"
    : "${TB_BUILD_CORES:=${SLURM_CPUS_PER_TASK:-4}}"
    : "${TB_ASSISTANT_URL:=}"
    : "${TB_ASSISTANT_MODEL:=qwen3:14b}"
    : "${TB_ASSISTANT_CONTEXT_CHARS:=24000}"
    : "${TB_RUN_OLLAMA:=0}"
    : "${TB_OLLAMA_CONTEXT_LENGTH:=16384}"
    : "${TB_STOP_GRACE:=300}"

    : "${TB_MONGO_PASSWORD:=}" "${MONGO_ROOT_PASSWORD:=}"
    : "${CLICKHOUSE_ADMIN_PASSWORD:=}" "${CLICKHOUSE_READER_PASSWORD:=}"
    : "${TB_BASIC_AUTH_PASSWORD:=}" "${TB_ASSISTANT_API_KEY:=}"
    : "${APPTAINER_DOCKER_USERNAME:=}" "${APPTAINER_DOCKER_PASSWORD:=}"

    if [ "$TB_RUN_OLLAMA" = 1 ]; then
        TB_ASSISTANT_URL=http://127.0.0.1:$TB_OLLAMA_PORT/v1
    fi
    APPTAINER_FLAGS=()
    if [ -n "$TB_APPTAINER_FLAGS" ]; then
        read -r -a APPTAINER_FLAGS <<<"$TB_APPTAINER_FLAGS"
    fi
}

require_secrets() {
    local name
    for name in TB_MONGO_PASSWORD MONGO_ROOT_PASSWORD CLICKHOUSE_ADMIN_PASSWORD CLICKHOUSE_READER_PASSWORD; do
        [ -n "${!name}" ] || die "$name is not set in $DEPLOY_DIR/secrets.env"
        case ${!name} in
            *[!A-Za-z0-9]*) die "$name must be letters and digits only (it goes into connection URLs)." ;;
        esac
    done
}

services() {
    if [ "$TB_RUN_OLLAMA" = 1 ]; then
        echo "database clickhouse ollama backend builder web"
    else
        echo "database clickhouse backend builder web"
    fi
}

# --- Apptainer and images ----------------------------------------------------

need_apptainer() {
    if [ -n "$TB_MODULES" ] && ! command -v "$TB_APPTAINER" >/dev/null 2>&1; then
        set +eu
        if ! command -v module >/dev/null 2>&1; then
            local init
            for init in /etc/profile.d/modules.sh /etc/profile.d/lmod.sh /etc/profile.d/z00_lmod.sh \
                        /usr/share/lmod/lmod/init/bash /usr/share/Modules/init/bash; do
                # shellcheck source=/dev/null
                if [ -r "$init" ]; then . "$init"; break; fi
            done
        fi
        # shellcheck disable=SC2086  # a list of module names
        module load $TB_MODULES
        set -eu
    fi
    command -v "$TB_APPTAINER" >/dev/null 2>&1 \
        || die "'$TB_APPTAINER' not found on $HOST. Set TB_MODULES (environment modules to load) or TB_APPTAINER (a path, or 'singularity') in stack.env."
}

image_key() {      # service -> image
    case $1 in
        database) echo mongo ;;
        builder)  echo pipeline ;;
        *)        echo "$1" ;;
    esac
}

image_ref() {
    case $1 in
        web)        echo "$TB_IMAGE_WEB" ;;
        backend)    echo "$TB_IMAGE_BACKEND" ;;
        pipeline)   echo "$TB_IMAGE_PIPELINE" ;;
        mongo)      echo "$TB_IMAGE_MONGO" ;;
        clickhouse) echo "$TB_IMAGE_CLICKHOUSE" ;;
        ollama)     echo "$TB_IMAGE_OLLAMA" ;;
        *)          die "unknown image '$1'" ;;
    esac
}

image_keys() {
    local svc
    for svc in $(services); do image_key "$svc"; done
}

# An image setting that is an absolute path to a .sif file is used as it is
# (clusters without internet access); anything else is pulled into images/.
sif_of() {
    local ref
    ref=$(image_ref "$1")
    case $ref in
        /*.sif) echo "$ref" ;;
        *)      echo "$IMAGE_DIR/$1.sif" ;;
    esac
}

registry_of() {
    local ref=${1#*://}
    echo "${ref%%/*}"
}

require_images() {
    local key sif
    for key in $(image_keys); do
        sif=$(sif_of "$key")
        [ -f "$sif" ] || die "Image $sif is missing. Run '$0 pull' where there is internet access (usually the login node)."
    done
}

cmd_pull() {
    local force=0 key ref sif uri app_registry
    [ "${1:-}" = "--force" ] && force=1
    need_apptainer
    mkdir -p "$IMAGE_DIR/cache" "$IMAGE_DIR/tmp"
    # Home quotas are small; keep Apptainer's cache and build space here.
    export APPTAINER_CACHEDIR=$IMAGE_DIR/cache APPTAINER_TMPDIR=$IMAGE_DIR/tmp
    export SINGULARITY_CACHEDIR=$IMAGE_DIR/cache SINGULARITY_TMPDIR=$IMAGE_DIR/tmp
    app_registry=$(registry_of "$TB_IMAGE_WEB")

    for key in $(image_keys); do
        ref=$(image_ref "$key")
        [ -n "$ref" ] || die "No image set for '$key' in stack.env."
        sif=$(sif_of "$key")
        case $ref in
            /*.sif)
                [ -f "$ref" ] || die "$ref does not exist."
                log "$key: using $ref"
                continue ;;
            *://*) uri=$ref ;;
            *)     uri=docker://$ref ;;
        esac
        if [ "$force" = 0 ] && [ -f "$sif" ] && [ "$(cat "$sif.ref" 2>/dev/null || true)" = "$uri" ]; then
            log "$key: $uri already pulled"
            continue
        fi
        log "$key: pulling $uri (large images take several minutes to convert)"
        rm -f "$sif.part"
        (
            # The login only goes to the registry of the application images.
            if [ -n "$APPTAINER_DOCKER_USERNAME" ] && [ "$(registry_of "$uri")" = "$app_registry" ]; then
                export APPTAINER_DOCKER_USERNAME APPTAINER_DOCKER_PASSWORD
                export SINGULARITY_DOCKER_USERNAME=$APPTAINER_DOCKER_USERNAME
                export SINGULARITY_DOCKER_PASSWORD=$APPTAINER_DOCKER_PASSWORD
            else
                unset APPTAINER_DOCKER_USERNAME APPTAINER_DOCKER_PASSWORD
            fi
            "$TB_APPTAINER" pull --force "$sif.part" "$uri"
        ) || die "Could not pull $uri."
        mv -f "$sif.part" "$sif"
        printf '%s\n' "$uri" >"$sif.ref"
    done
    # The SIF files are what is used; the layer cache would only double the space.
    rm -rf "${IMAGE_DIR:?}/cache" "${IMAGE_DIR:?}/tmp"

    if [ "$TB_RUN_OLLAMA" = 1 ]; then
        pull_model_standalone || warn "Could not download the model $TB_ASSISTANT_MODEL here; the job will try again."
    fi
    log "Images are in $IMAGE_DIR"
}

# --- Paths -------------------------------------------------------------------

# Where the databases keep their files. With TB_NODE_LOCAL_DIR they run on the
# node's own disk and are copied back to the shared data directory on stop.
resolve_paths() {
    local base=$TB_NODE_LOCAL_DIR name
    MONGO_DIR=$TB_DATA_DIR/mongo
    CLICKHOUSE_DIR=$TB_DATA_DIR/clickhouse
    TMP_BASE=$RUN_DIR/tmp
    LOCAL_BASE=""
    if [ -n "$base" ]; then
        case $base in
            \$*)    # the name of a variable set inside the job, such as $TMPDIR
                name=${base#\$}
                base=${!name:-}
                [ -n "$base" ] || die "TB_NODE_LOCAL_DIR is \$$name, which is not set on $HOST."
                ;;
        esac
        { [ -d "$base" ] && [ -w "$base" ]; } || die "Node-local directory $base is not a writable directory on $HOST."
        LOCAL_BASE=$base/tersect-$TB_NAME-$(id -un)
        MONGO_DIR=$LOCAL_BASE/mongo
        CLICKHOUSE_DIR=$LOCAL_BASE/clickhouse
        TMP_BASE=$LOCAL_BASE/tmp
    fi
}

save_paths() {
    {
        printf "MONGO_DIR='%s'\n" "$MONGO_DIR"
        printf "CLICKHOUSE_DIR='%s'\n" "$CLICKHOUSE_DIR"
        printf "TMP_BASE='%s'\n" "$TMP_BASE"
        printf "LOCAL_BASE='%s'\n" "$LOCAL_BASE"
    } >"$RUN_DIR/paths.env"
}

load_paths() {
    if [ -f "$RUN_DIR/paths.env" ]; then
        # shellcheck source=/dev/null
        . "$RUN_DIR/paths.env"
    else
        resolve_paths
    fi
}

LOCAL_MARKER_NAME=.node-local-active

node_local_in() {
    [ -n "$LOCAL_BASE" ] || return 0
    local marker=$TB_DATA_DIR/$LOCAL_MARKER_NAME db
    command -v rsync >/dev/null 2>&1 || die "TB_NODE_LOCAL_DIR needs rsync on the compute nodes."
    if [ -f "$marker" ]; then
        if [ "$(cat "$marker")" = "$HOST $LOCAL_BASE" ] && [ -d "$MONGO_DIR" ] && [ -d "$CLICKHOUSE_DIR" ]; then
            log "Found the databases of an interrupted run in $LOCAL_BASE; continuing with them."
            return 0
        fi
        die "The databases last ran from node-local storage ($(cat "$marker")) and were not copied back, so $TB_DATA_DIR/mongo and $TB_DATA_DIR/clickhouse are older than that run. Recover them from that node if it still has them (rsync them over the shared copies) or accept the older copies; then remove $marker and start again."
    fi
    mkdir -p "$LOCAL_BASE"
    for db in mongo clickhouse; do
        log "Copying $db to node-local storage ($LOCAL_BASE)"
        mkdir -p "$TB_DATA_DIR/$db" "$LOCAL_BASE/$db"
        rsync -a --delete "$TB_DATA_DIR/$db/" "$LOCAL_BASE/$db/" \
            || die "Could not copy $db to $LOCAL_BASE (is the node's disk full?)."
    done
    printf '%s %s\n' "$HOST" "$LOCAL_BASE" >"$marker"
}

# Called as 'node_local_out || ...', where 'set -e' does not apply: every
# step is checked, and the marker and the node-local copy are only removed
# once both databases are back on the shared filesystem.
node_local_out() {
    [ -n "${LOCAL_BASE:-}" ] || return 0
    local marker=$TB_DATA_DIR/$LOCAL_MARKER_NAME db
    [ -f "$marker" ] || return 0
    if [ "$(cat "$marker")" != "$HOST $LOCAL_BASE" ]; then
        warn "The node-local databases belong to '$(cat "$marker")'; not copying anything back from $HOST."
        return 0
    fi
    if service_alive database || service_alive clickhouse; then
        warn "A database is still running; not copying node-local data back."
        return 1
    fi
    for db in mongo clickhouse; do
        if [ ! -d "$LOCAL_BASE/$db" ]; then
            warn "$LOCAL_BASE/$db is missing; nothing was copied back and $marker is kept."
            return 1
        fi
    done
    for db in mongo clickhouse; do
        log "Copying $db back to $TB_DATA_DIR/$db"
        if ! rsync -a --delete "$LOCAL_BASE/$db/" "$TB_DATA_DIR/$db/"; then
            warn "Copying $db back failed. The node-local copy in $LOCAL_BASE on $HOST is the current one; it and $marker are kept."
            return 1
        fi
    done
    rm -f "$marker" || return 1
    rm -rf "${LOCAL_BASE:?}"
}

# --- Configuration written at start (run/) -----------------------------------

sha256_hex() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum | cut -d' ' -f1
    else
        shasum -a 256 | cut -d' ' -f1
    fi
}

# put FILE KEY VALUE: one line of an Apptainer --env-file.
put() {
    local value=$3
    case $value in
        *\'*) die "$2 contains a single quote, which the env files cannot hold." ;;
    esac
    printf "%s='%s'\n" "$2" "$value" >>"$1"
}

render() {
    local envdir=$RUN_DIR/env file ch=$RUN_DIR/clickhouse
    mkdir -p "$RUN_DIR/pids" "$envdir" "$ch/config.d" "$ch/users.d" "$RUN_DIR/site.d" "$RUN_DIR/mongo" \
             "$RUN_DIR/caddy-config" "$LOG_DIR/clickhouse" \
             "$TB_DATA_DIR/tersect/uploads" "$TB_DATA_DIR/mongo" "$TB_DATA_DIR/clickhouse" "$TB_DATA_DIR/caddy" \
             "$MONGO_DIR" "$CLICKHOUSE_DIR" "$TMP_BASE"
    [ -d "$TB_SHARED_DIR" ] || mkdir -p "$TB_SHARED_DIR"
    if [ "$TB_RUN_OLLAMA" = 1 ]; then mkdir -p "$TB_DATA_DIR/ollama"; fi
    rm -f "${envdir:?}"/*.env

    # Backend and builder: the x-app-env block of deploy/compose/docker-compose.yml.
    for file in "$envdir/backend.env" "$envdir/builder.env"; do
        put "$file" TB_MONGO_HOST "mongodb://$TB_MONGO_USER:$TB_MONGO_PASSWORD@127.0.0.1:$TB_MONGO_PORT"
        put "$file" TB_DB_NAME "$TB_DB_NAME"
        put "$file" TB_LOCAL_DB_PATH /data/tersect
        put "$file" TB_SERVER_HOST "$TB_PUBLIC_URL/TersectBrowserGP"
        put "$file" TB_CLICKHOUSE_HOST 127.0.0.1
        put "$file" TB_CLICKHOUSE_PORT "$TB_CLICKHOUSE_HTTP_PORT"
        put "$file" TB_BIND_HOST 127.0.0.1
        put "$file" TMPDIR /tmp
        put "$file" XDG_CACHE_HOME /tmp/.cache
    done
    file=$envdir/backend.env
    put "$file" NODE_ENV production
    put "$file" PORT "$TB_BACKEND_PORT"
    put "$file" TB_CLICKHOUSE_USER "$CLICKHOUSE_READER_USER"
    put "$file" TB_CLICKHOUSE_PASSWORD "$CLICKHOUSE_READER_PASSWORD"
    # Express listens on every interface by default; this keeps it on localhost.
    put "$file" NODE_OPTIONS "--require=/opt/tersect/bind-localhost.cjs"

    file=$envdir/builder.env
    put "$file" PYTHONPATH /app/pipeline
    put "$file" TB_CLICKHOUSE_USER "$CLICKHOUSE_ADMIN_USER"
    put "$file" TB_CLICKHOUSE_PASSWORD "$CLICKHOUSE_ADMIN_PASSWORD"
    put "$file" TB_SERVER_FOLDERS /data/shared
    put "$file" TB_PIPELINE_ALLOWED_ROOTS /data/tersect/uploads:/data/shared
    put "$file" TB_BUILDER_PORT "$TB_BUILDER_PORT"
    # os.cpu_count() reports the whole node, not what the job was given.
    put "$file" TB_BUILD_CORES "$TB_BUILD_CORES"
    put "$file" TB_ASSISTANT_URL "$TB_ASSISTANT_URL"
    put "$file" TB_ASSISTANT_MODEL "$TB_ASSISTANT_MODEL"
    put "$file" TB_ASSISTANT_CONTEXT_CHARS "$TB_ASSISTANT_CONTEXT_CHARS"
    if [ -n "$TB_ASSISTANT_API_KEY" ]; then put "$file" TB_ASSISTANT_API_KEY "$TB_ASSISTANT_API_KEY"; fi

    file=$envdir/web.env
    put "$file" TB_SITE_ADDRESS ":$TB_HTTP_PORT"
    put "$file" TB_TLS_DIRECTIVE ""
    put "$file" TB_BACKEND "127.0.0.1:$TB_BACKEND_PORT"
    put "$file" TB_BUILDER "127.0.0.1:$TB_BUILDER_PORT"
    put "$file" XDG_DATA_HOME /data
    put "$file" XDG_CONFIG_HOME /config

    # mongod itself needs none of these; the init and shutdown scripts read them.
    file=$envdir/database.env
    put "$file" MONGO_INITDB_ROOT_USERNAME "$MONGO_ROOT_USER"
    put "$file" MONGO_INITDB_ROOT_PASSWORD "$MONGO_ROOT_PASSWORD"
    put "$file" TB_MONGO_USER "$TB_MONGO_USER"
    put "$file" TB_MONGO_PASSWORD "$TB_MONGO_PASSWORD"
    put "$file" TB_DB_NAME "$TB_DB_NAME"

    # The server reads its users from users.d; only the client gets the password.
    : >"$envdir/clickhouse.env"
    file=$envdir/clickhouse-client.env
    put "$file" CLICKHOUSE_USER "$CLICKHOUSE_ADMIN_USER"
    put "$file" CLICKHOUSE_PASSWORD "$CLICKHOUSE_ADMIN_PASSWORD"

    if [ "$TB_RUN_OLLAMA" = 1 ]; then
        file=$envdir/ollama.env
        put "$file" OLLAMA_HOST "127.0.0.1:$TB_OLLAMA_PORT"
        put "$file" OLLAMA_MODELS /data/ollama/models
        put "$file" OLLAMA_CONTEXT_LENGTH "$TB_OLLAMA_CONTEXT_LENGTH"
        put "$file" OLLAMA_FLASH_ATTENTION 1
        put "$file" OLLAMA_KV_CACHE_TYPE q8_0
        put "$file" OLLAMA_KEEP_ALIVE 30m
    fi

    # ClickHouse: the image's config.d (which listens on every interface) and
    # users.d are replaced by these two folders.
    rm -f "${ch:?}/config.d"/*.xml "${ch:?}/users.d"/*.xml
    cat >"$ch/config.d/tersect-hpc.xml" <<XML
<!-- Written by tersect-stack.sh at every start; edits are lost. -->
<clickhouse>
    <listen_host replace="replace">127.0.0.1</listen_host>
    <listen_try>1</listen_try>
    <http_port>$TB_CLICKHOUSE_HTTP_PORT</http_port>
    <tcp_port>$TB_CLICKHOUSE_TCP_PORT</tcp_port>
    <mysql_port remove="remove"/>
    <postgresql_port remove="remove"/>
    <interserver_http_port remove="remove"/>
    <logger>
        <size>100M</size>
        <count>5</count>
    </logger>
</clickhouse>
XML
    if [ "$TB_CLICKHOUSE_LOW_MEMORY" = 1 ]; then
        cp "$CONFIG_DIR/low-memory.xml" "$ch/config.d/low-memory.xml"
    fi
    cat >"$ch/users.d/tersect-admin.xml" <<XML
<!-- Written by tersect-stack.sh at every start; edits are lost. -->
<clickhouse>
    <users>
        <default remove="remove"/>
        <$CLICKHOUSE_ADMIN_USER>
            <profile>default</profile>
            <networks>
                <ip>127.0.0.1</ip>
                <ip>::1</ip>
            </networks>
            <password_sha256_hex>$(printf '%s' "$CLICKHOUSE_ADMIN_PASSWORD" | sha256_hex)</password_sha256_hex>
            <quota>default</quota>
            <access_management>1</access_management>
        </$CLICKHOUSE_ADMIN_USER>
    </users>
</clickhouse>
XML

    # MongoDB: users on first start (through the localhost exception), the
    # application user's password and role kept in step afterwards.
    cat >"$RUN_DIR/mongo/init.js" <<'JS'
const env = process.env;
const admin = db.getSiblingDB('admin');
function login() {
  try {
    return admin.auth(env.MONGO_INITDB_ROOT_USERNAME, env.MONGO_INITDB_ROOT_PASSWORD).ok === 1;
  } catch (error) {
    return false;
  }
}
if (!login()) {
  admin.createUser({
    user: env.MONGO_INITDB_ROOT_USERNAME,
    pwd: env.MONGO_INITDB_ROOT_PASSWORD,
    roles: [{ role: 'root', db: 'admin' }],
  });
  if (!login()) {
    throw new Error('could not log in as the root user just created');
  }
  print('created the root user');
}
const roles = [{ role: 'readWrite', db: env.TB_DB_NAME }];
if (admin.getUser(env.TB_MONGO_USER) === null) {
  admin.createUser({ user: env.TB_MONGO_USER, pwd: env.TB_MONGO_PASSWORD, roles: roles });
  print('created the application user');
} else {
  admin.updateUser(env.TB_MONGO_USER, { pwd: env.TB_MONGO_PASSWORD, roles: roles });
}
JS
    cat >"$RUN_DIR/mongo/shutdown.js" <<'JS'
const env = process.env;
const admin = db.getSiblingDB('admin');
admin.auth(env.MONGO_INITDB_ROOT_USERNAME, env.MONGO_INITDB_ROOT_PASSWORD);
try {
  admin.shutdownServer({ timeoutSecs: 30 });
} catch (error) {
  // The connection drops when the server goes down.
}
JS

    # Caddy: where to listen. The password snippet is written by render_auth,
    # which needs the web image.
    rm -f "${RUN_DIR:?}/site.d"/*.caddy
    printf 'bind %s\n' "$TB_BIND_ADDRESS" >"$RUN_DIR/site.d/bind.caddy"
}

render_auth() {
    local hash
    if [ -z "$TB_BASIC_AUTH_PASSWORD" ]; then
        warn "No TB_BASIC_AUTH_PASSWORD: anyone who can reach port $TB_HTTP_PORT on $HOST can use the site."
        return 0
    fi
    # Through stdin, so the password is never on a command line.
    hash=$(printf '%s\n' "$TB_BASIC_AUTH_PASSWORD" \
        | "$TB_APPTAINER" exec ${APPTAINER_FLAGS[@]+"${APPTAINER_FLAGS[@]}"} "$(sif_of web)" caddy hash-password) \
        || die "Could not hash the site password with the web image."
    case $hash in
        \$2*) ;;
        *) die "Unexpected output from 'caddy hash-password'." ;;
    esac
    printf 'basic_auth {\n\t%s %s\n}\n' "$TB_BASIC_AUTH_USER" "$hash" >"$RUN_DIR/site.d/auth.caddy"
}

# --- Processes ---------------------------------------------------------------

port_open() {      # host port
    (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null
}

service_port() {
    case $1 in
        database)   echo "$TB_MONGO_PORT" ;;
        clickhouse) echo "$TB_CLICKHOUSE_TCP_PORT" ;;
        ollama)     echo "$TB_OLLAMA_PORT" ;;
        backend)    echo "$TB_BACKEND_PORT" ;;
        builder)    echo "$TB_BUILDER_PORT" ;;
        web)        echo "$TB_HTTP_PORT" ;;
    esac
}

service_host() {
    if [ "$1" = web ] && [ "$TB_BIND_ADDRESS" != 0.0.0.0 ]; then
        echo "$TB_BIND_ADDRESS"
    else
        echo 127.0.0.1
    fi
}

service_pid() {    # prints the pid if the service was started on this node
    local file=$RUN_DIR/pids/$1.pid host pid
    [ -f "$file" ] || return 1
    read -r host pid <"$file" || return 1
    { [ "$host" = "$HOST" ] && [ -n "$pid" ]; } || return 1
    echo "$pid"
}

service_alive() {
    local pid
    pid=$(service_pid "$1") || return 1
    kill -0 "$pid" 2>/dev/null
}

clear_run_state() {
    rm -f "${RUN_DIR:?}/owner" "${RUN_DIR:?}/node.env" "${RUN_DIR:?}/paths.env" "${RUN_DIR:?}/pids"/*.pid
}

rotate_log() {
    local file=$1 size
    [ -f "$file" ] || return 0
    size=$(wc -c <"$file")
    if [ "$size" -gt 52428800 ]; then
        mv -f "$file" "$file.1"
    fi
}

# launch SERVICE [apptainer options...] -- command...
# Starts one container in the background, in its own session, with its output
# in logs/SERVICE.log and its own /tmp.
launch() {
    local svc=$1 sif tmp pid
    local -a opts=() runner=()
    shift
    while [ "$1" != "--" ]; do opts+=("$1"); shift; done
    shift
    sif=$(sif_of "$(image_key "$svc")")
    tmp=$TMP_BASE/$svc
    rm -rf "${TMP_BASE:?}/${svc:?}"
    mkdir -p "$tmp"
    rotate_log "$LOG_DIR/$svc.log"
    if command -v setsid >/dev/null 2>&1; then runner=(setsid); fi
    ${runner[@]+"${runner[@]}"} "$TB_APPTAINER" exec ${APPTAINER_FLAGS[@]+"${APPTAINER_FLAGS[@]}"} \
        --env-file "$RUN_DIR/env/$svc.env" --bind "$tmp:/tmp" ${opts[@]+"${opts[@]}"} \
        "$sif" "$@" >>"$LOG_DIR/$svc.log" 2>&1 </dev/null &
    pid=$!
    printf '%s %s\n' "$HOST" "$pid" >"$RUN_DIR/pids/$svc.pid"
    log "$svc: started (pid $pid, port $(service_port "$svc"), log $LOG_DIR/$svc.log)"
}

# tool ENVFILE IMAGE [apptainer options...] -- command...: a short-lived
# client in the foreground (mongosh, clickhouse-client, ollama).
tool() {
    local envfile=$RUN_DIR/env/$1.env sif
    local -a opts=()
    sif=$(sif_of "$2")
    shift 2
    while [ "$1" != "--" ]; do opts+=("$1"); shift; done
    shift
    "$TB_APPTAINER" exec ${APPTAINER_FLAGS[@]+"${APPTAINER_FLAGS[@]}"} --env-file "$envfile" \
        ${opts[@]+"${opts[@]}"} "$sif" "$@"
}

start_service() {
    local svc=$1
    local -a nv=()
    if service_alive "$svc"; then
        log "$svc: already running"
        return 0
    fi
    case $svc in
        database)
            launch database --bind "$MONGO_DIR:/data/db" -- \
                mongod --dbpath /data/db --bind_ip 127.0.0.1 --port "$TB_MONGO_PORT" --auth \
                       --nounixsocket --wiredTigerCacheSizeGB "$TB_MONGO_CACHE_GB"
            ;;
        clickhouse)
            # Not the image's entrypoint: that one expects to start as root.
            launch clickhouse \
                --bind "$CLICKHOUSE_DIR:/var/lib/clickhouse" \
                --bind "$LOG_DIR/clickhouse:/var/log/clickhouse-server" \
                --bind "$RUN_DIR/clickhouse/config.d:/etc/clickhouse-server/config.d:ro" \
                --bind "$RUN_DIR/clickhouse/users.d:/etc/clickhouse-server/users.d:ro" \
                --pwd /var/lib/clickhouse -- \
                clickhouse-server --config-file=/etc/clickhouse-server/config.xml
            ;;
        ollama)
            if command -v nvidia-smi >/dev/null 2>&1; then
                nv=(--nv)
            else
                warn "No nvidia-smi on $HOST: the model will run on CPUs, slowly. Ask for a GPU (gres)."
            fi
            launch ollama ${nv[@]+"${nv[@]}"} --bind "$TB_DATA_DIR/ollama:/data/ollama" -- ollama serve
            ;;
        backend)
            # The same command as in deploy/compose, without npx (which wants a
            # writable home). Analyses write beside the code: --writable-tmpfs.
            launch backend --writable-tmpfs \
                --bind "$TB_DATA_DIR/tersect:/data/tersect" \
                --bind "$CONFIG_DIR/bind-localhost.cjs:/opt/tersect/bind-localhost.cjs:ro" \
                --pwd /app/backend -- \
                ./node_modules/.bin/tsx server-dev.ts --config ../tbconfig.json
            ;;
        builder)
            # python -m tbpipeline.server, but listening on localhost only.
            launch builder --writable-tmpfs \
                --bind "$TB_DATA_DIR/tersect:/data/tersect" \
                --bind "$TB_SHARED_DIR:/data/shared:ro" \
                --pwd /app -- \
                python -c 'import os, uvicorn; uvicorn.run("tbpipeline.server.app:app", host=os.environ["TB_BIND_HOST"], port=int(os.environ["TB_BUILDER_PORT"]), log_level="info")'
            ;;
        web)
            launch web \
                --bind "$RUN_DIR/site.d:/etc/caddy/site.d:ro" \
                --bind "$TB_DATA_DIR/caddy:/data" \
                --bind "$RUN_DIR/caddy-config:/config" -- \
                caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
            ;;
        *) die "unknown service '$svc'" ;;
    esac
}

wait_ready() {     # service seconds
    local svc=$1 limit=$2 waited=0 host port
    host=$(service_host "$svc")
    port=$(service_port "$svc")
    while ! port_open "$host" "$port"; do
        if ! service_alive "$svc"; then
            tail -n 30 "$LOG_DIR/$svc.log" >&2 || true
            die "$svc stopped while starting; the end of its log is above ($LOG_DIR/$svc.log)."
        fi
        [ "$waited" -lt "$limit" ] || die "$svc did not open port $port within $limit seconds; see $LOG_DIR/$svc.log."
        sleep 2
        waited=$((waited + 2))
    done
    log "$svc: listening on $host:$port"
}

wait_exit() {      # pid seconds
    local pid=$1 limit=$2 waited=0
    while kill -0 "$pid" 2>/dev/null; do
        [ "$waited" -lt "$limit" ] || return 1
        sleep 1
        waited=$((waited + 1))
    done
}

clickhouse_client() {
    tool clickhouse-client clickhouse -- clickhouse-client --host 127.0.0.1 --port "$TB_CLICKHOUSE_TCP_PORT" "$@"
}

mongo_script() {
    tool database mongo --bind "$RUN_DIR/mongo:/opt/tersect/mongo:ro" -- \
        mongosh --quiet "mongodb://127.0.0.1:$TB_MONGO_PORT/admin" "/opt/tersect/mongo/$1"
}

# What docker-entrypoint-initdb.d does in the compose stack (mongo-init.js,
# clickhouse/users.sh). Safe to repeat, so it runs at every start.
init_database() {
    local try
    for try in 1 2 3 4 5; do
        if mongo_script init.js; then
            log "database: users are in place"
            return 0
        fi
        sleep 3
    done
    die "Could not set up the MongoDB users ($try attempts); see $LOG_DIR/database.log."
}

init_clickhouse() {
    local try hash
    for try in 1 2 3 4 5 6 7 8 9 10; do
        if echo 'SELECT 1' | clickhouse_client >/dev/null 2>&1; then break; fi
        [ "$try" != 10 ] || die "ClickHouse does not accept the admin login; see $LOG_DIR/clickhouse/."
        sleep 3
    done
    clickhouse_client --multiquery <"$CONFIG_DIR/schema.sql" || die "Could not apply the ClickHouse schema."
    hash=$(printf '%s' "$CLICKHOUSE_READER_PASSWORD" | sha256_hex)
    clickhouse_client --multiquery <<SQL || die "Could not create the ClickHouse reader user."
CREATE USER IF NOT EXISTS $CLICKHOUSE_READER_USER IDENTIFIED WITH sha256_hash BY '$hash'
  SETTINGS readonly = 1, max_execution_time = 30;
ALTER USER $CLICKHOUSE_READER_USER IDENTIFIED WITH sha256_hash BY '$hash';
GRANT SELECT ON tersect.* TO $CLICKHOUSE_READER_USER;
SQL
    log "clickhouse: schema and reader user are in place"
}

ensure_model() {
    if tool ollama ollama -- ollama show "$TB_ASSISTANT_MODEL" >/dev/null 2>&1; then
        log "ollama: model $TB_ASSISTANT_MODEL is present"
        return 0
    fi
    log "ollama: downloading $TB_ASSISTANT_MODEL (several GB)"
    tool ollama ollama -- ollama pull "$TB_ASSISTANT_MODEL"
}

# On the login node: a temporary model server, only to download the model.
pull_model_standalone() {
    local status=0
    resolve_paths
    TMP_BASE=$RUN_DIR/tmp
    mkdir -p "$RUN_DIR/pids" "$RUN_DIR/env" "$LOG_DIR" "$TB_DATA_DIR/ollama" "$TMP_BASE"
    if read_node_file; then
        warn "The stack is up on $NODE; it downloads the model itself when it starts."
        return 0
    fi
    : >"$RUN_DIR/env/ollama.env"
    put "$RUN_DIR/env/ollama.env" OLLAMA_HOST "127.0.0.1:$TB_OLLAMA_PORT"
    put "$RUN_DIR/env/ollama.env" OLLAMA_MODELS /data/ollama/models
    if port_open 127.0.0.1 "$TB_OLLAMA_PORT"; then
        warn "Port $TB_OLLAMA_PORT is in use on $HOST."
        return 1
    fi
    launch ollama --bind "$TB_DATA_DIR/ollama:/data/ollama" -- ollama serve
    ( wait_ready ollama 60 && ensure_model ) || status=1
    stop_service ollama 15
    return "$status"
}

stop_service() {   # service seconds
    local svc=$1 limit=$2 file=$RUN_DIR/pids/$1.pid host="" pid=""
    [ -f "$file" ] || return 0
    read -r host pid <"$file" || true
    if [ "$host" != "$HOST" ]; then
        warn "$svc was started on $host, not $HOST; stop it there, or use '$0 cancel'."
        return 1
    fi
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log "$svc: stopping"
        case $svc in
            database|clickhouse)
                # Asked over their own protocol first: that does not depend on
                # how Apptainer passes signals on. SIGTERM if that fails.
                if [ "$svc" = database ]; then
                    mongo_script shutdown.js >/dev/null 2>&1 || true
                else
                    echo 'SYSTEM SHUTDOWN' | clickhouse_client >/dev/null 2>&1 || true
                fi
                wait_exit "$pid" "$limit" || kill -TERM "$pid" 2>/dev/null || true
                ;;
            *)
                kill -TERM "$pid" 2>/dev/null || true
                ;;
        esac
        if ! wait_exit "$pid" "$limit"; then
            warn "$svc did not stop within $limit seconds; killing it."
            kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
            wait_exit "$pid" 10 || true
        fi
    fi
    rm -f "$file"
}

stop_timeout() {
    case $1 in
        database)   echo 45 ;;
        clickhouse) echo 60 ;;
        builder)    echo 20 ;;
        *)          echo 10 ;;
    esac
}

# --- Slurm -------------------------------------------------------------------

job_id() {
    [ -s "$RUN_DIR/job.id" ] && cat "$RUN_DIR/job.id"
}

job_state() {      # empty when the job is no longer known to the scheduler
    squeue -h -j "$1" -o %T 2>/dev/null | head -n 1 || true
}

need_slurm() {
    local name
    for name in sbatch squeue scancel; do
        command -v "$name" >/dev/null 2>&1 || die "$name not found on $HOST; run this where Slurm's commands are available."
    done
}

read_node_file() {
    NODE="" NODE_JOB="" NODE_PORT="" NODE_STARTED=""
    [ -f "$RUN_DIR/node.env" ] || return 1
    # shellcheck source=/dev/null
    . "$RUN_DIR/node.env"
}

# Two copies of the databases on one data directory would corrupt it, and
# their lock files cannot be trusted on network filesystems. So a start first
# claims the deployment in run/owner ("node job"), and only its owner stops it.
EXIT_HELD=3

read_owner() {
    OWNER_NODE="" OWNER_JOB=""
    [ -f "$RUN_DIR/owner" ] || return 1
    read -r OWNER_NODE OWNER_JOB <"$RUN_DIR/owner" || true
    [ -n "$OWNER_NODE" ]
}

held() {
    printf '[tersect %s] ERROR: %s\n' "$(date '+%H:%M:%S')" "$*" >&2
    exit "$EXIT_HELD"
}

claim() {
    local me=${SLURM_JOB_ID:--} waited=0 state
    if read_owner; then
        if [ "$OWNER_JOB" = "$me" ] && [ "$OWNER_NODE" = "$HOST" ]; then
            return 0        # ours already: a start by hand on this node, or run again
        fi
        if [ "$OWNER_JOB" = - ]; then
            held "The stack was started by hand on $OWNER_NODE. Stop it there ('$0 stop'); if that node is gone, remove $RUN_DIR/owner."
        fi
        command -v squeue >/dev/null 2>&1 \
            || held "Job $OWNER_JOB on $OWNER_NODE holds this deployment and squeue is not available here to check on it."
        # The job before this one may still be stopping (resubmission).
        while state=$(job_state "$OWNER_JOB") && [ -n "$state" ]; do
            [ "$waited" -lt 180 ] || held "Job $OWNER_JOB ($state on $OWNER_NODE) holds this deployment; cancel it first."
            log "Waiting for job $OWNER_JOB on $OWNER_NODE to finish"
            sleep 10
            waited=$((waited + 10))
        done
        log "Job $OWNER_JOB ended without stopping the stack; taking over."
        clear_run_state
    fi
    if ! (set -o noclobber; printf '%s %s\n' "$HOST" "$me" >"$RUN_DIR/owner") 2>/dev/null; then
        held "Another start claimed this deployment at the same moment."
    fi
    # Also covers a job submitted with sbatch directly rather than 'submit'.
    if [ -n "${SLURM_JOB_ID:-}" ]; then
        printf '%s\n' "$SLURM_JOB_ID" >"$RUN_DIR/job.id"
    fi
}

owned_by_other_job() {
    read_owner || return 1
    [ -n "${SLURM_JOB_ID:-}" ] && [ "$OWNER_JOB" != - ] && [ "$OWNER_JOB" != "$SLURM_JOB_ID" ]
}

cmd_submit() {
    local id state
    need_slurm
    mkdir -p "$RUN_DIR" "$LOG_DIR"
    if id=$(job_id) && state=$(job_state "$id") && [ -n "$state" ] && [ "$id" != "${SLURM_JOB_ID:-}" ]; then
        log "Job $id is already $state; not submitting another. ('$0 cancel' stops it.)"
        return 0
    fi
    # A job that was killed outright leaves its "up" marker behind.
    if read_node_file && [ -n "$NODE_JOB" ] && [ -z "$(job_state "$NODE_JOB")" ]; then
        rm -f "$RUN_DIR/node.env"
    fi
    id=$(cd "$DEPLOY_DIR" && sbatch --parsable tersect.sbatch) \
        || die "sbatch refused the job; check the #SBATCH lines of $DEPLOY_DIR/tersect.sbatch."
    id=${id%%;*}
    printf '%s\n' "$id" >"$RUN_DIR/job.id"
    log "Submitted job $id. '$0 status' shows where it runs and how to connect."
}

cmd_cancel() {
    local id state waited=0 limit
    need_slurm
    id=$(job_id) || { log "No job recorded for this deployment."; return 0; }
    state=$(job_state "$id")
    if [ -z "$state" ]; then
        log "Job $id is not in the queue any more."
        rm -f "$RUN_DIR/job.id"
        return 0
    fi
    if [ "$state" = RUNNING ]; then
        # Only the batch script gets the signal; it stops the services in
        # order and exits. A plain scancel would kill them after KillWait.
        log "Asking job $id to stop the stack"
        scancel --batch --signal=TERM "$id" || true
        limit=$((TB_STOP_GRACE + 60))
        while [ -n "$(job_state "$id")" ]; do
            if [ "$waited" -ge "$limit" ]; then
                warn "Job $id did not finish within $limit seconds; cancelling it outright."
                scancel "$id" || true
                break
            fi
            sleep 5
            waited=$((waited + 5))
        done
    else
        scancel "$id" || true
    fi
    rm -f "$RUN_DIR/job.id"
    log "Job $id cancelled. The data in $TB_DATA_DIR is untouched."
}

# --- Commands ----------------------------------------------------------------

cmd_render() {
    require_secrets
    resolve_paths
    render
    log "Wrote $RUN_DIR"
}

cmd_start() {
    local svc
    require_secrets
    need_apptainer
    require_images
    mkdir -p "$RUN_DIR/pids" "$LOG_DIR"
    claim
    resolve_paths
    node_local_in
    render
    save_paths

    for svc in $(services); do
        if ! service_alive "$svc" && port_open "$(service_host "$svc")" "$(service_port "$svc")"; then
            die "Port $(service_port "$svc") (for $svc) is already in use on $HOST, perhaps by another deployment. Change it in stack.env."
        fi
    done
    # ClickHouse opens many files: raise the soft limit as far as the node allows.
    ulimit -n "$(ulimit -Hn)" 2>/dev/null || true

    start_service database
    start_service clickhouse
    wait_ready database 120
    wait_ready clickhouse 180
    init_database
    init_clickhouse
    if [ "$TB_RUN_OLLAMA" = 1 ]; then
        start_service ollama
        wait_ready ollama 60
        ensure_model || warn "The model $TB_ASSISTANT_MODEL is not available (no internet on $HOST?). Run '$0 pull' on the login node while the stack is down; the assistant fails until then."
    fi
    start_service backend
    start_service builder
    wait_ready backend 180
    wait_ready builder 120
    render_auth
    start_service web
    wait_ready web 60

    {
        printf "NODE='%s'\n" "$HOST"
        printf "NODE_JOB='%s'\n" "${SLURM_JOB_ID:-}"
        printf "NODE_PORT='%s'\n" "$TB_HTTP_PORT"
        printf "NODE_STARTED='%s'\n" "$(date '+%Y-%m-%d %H:%M:%S')"
    } >"$RUN_DIR/node.env"
    log "Tersect Browser is up on $HOST."
    print_access
}

cmd_stop() {
    local svc failed=0
    if owned_by_other_job; then
        warn "Job $OWNER_JOB on $OWNER_NODE holds this deployment; leaving it alone."
        return 0
    fi
    load_paths
    for svc in web builder backend ollama clickhouse database; do
        stop_service "$svc" "$(stop_timeout "$svc")" || failed=1
    done
    if [ "$failed" = 0 ]; then
        node_local_out || failed=1
    fi
    if [ "$failed" = 0 ]; then
        if ! read_owner || [ "$OWNER_NODE" = "$HOST" ]; then
            rm -f "$RUN_DIR/owner" "$RUN_DIR/node.env" "$RUN_DIR/paths.env"
        fi
        log "Stopped."
    else
        warn "Not everything was stopped or saved; see the messages above."
    fi
    return "$failed"
}

cmd_check() {
    local svc dead=""
    for svc in $(services); do
        service_alive "$svc" || dead="$dead $svc"
    done
    [ -z "$dead" ] || { warn "Not running:$dead"; return 1; }
}

print_access() {
    local login=${TB_SSH_LOGIN:-<you>@<login-node>} user port_opt=""
    read_node_file || return 0
    user=${login%%@*}
    [ "$TB_SSH_PORT" = 22 ] || port_opt=" -p $TB_SSH_PORT"
    echo
    echo "To use it, open a tunnel from your own computer and leave it running:"
    echo
    case $TB_BIND_ADDRESS in
        127.0.0.1)
            if [ "$TB_SSH_PORT" = 22 ]; then
                echo "    ssh -N -L $TB_TUNNEL_LOCAL_PORT:127.0.0.1:$NODE_PORT -J $login $user@$NODE"
            else
                echo "    ssh -N -L $TB_TUNNEL_LOCAL_PORT:127.0.0.1:$NODE_PORT -J $login:$TB_SSH_PORT $user@$NODE"
            fi
            echo
            echo "(The site listens on $NODE's localhost only, so the tunnel ends on $NODE"
            echo "itself. That needs SSH access to compute nodes where you have a job; if"
            echo "your cluster does not allow it, see 'Access' in README.md.)"
            ;;
        *)
            echo "    ssh -N -L $TB_TUNNEL_LOCAL_PORT:$NODE:$NODE_PORT$port_opt $login"
            ;;
    esac
    echo
    echo "Then browse to $TB_PUBLIC_URL/TersectBrowserGP/"
    if [ -n "$TB_BASIC_AUTH_PASSWORD" ]; then
        echo "User name: $TB_BASIC_AUTH_USER   (password: TB_BASIC_AUTH_PASSWORD in secrets.env)"
    fi
}

cmd_status() {
    local id="" state="" svc
    echo "Deployment: $TB_NAME in $DEPLOY_DIR"
    if id=$(job_id); then
        if command -v squeue >/dev/null 2>&1; then
            state=$(job_state "$id")
            if [ -n "$state" ]; then
                echo "Job:        $id, $state$(squeue -h -j "$id" -o ' on %N, %L left' 2>/dev/null | head -n 1)"
            else
                echo "Job:        $id, no longer in the queue (see $LOG_DIR/slurm-$id.out)"
            fi
        else
            echo "Job:        $id (squeue is not available here)"
        fi
    else
        echo "Job:        none submitted"
    fi
    if ! read_node_file; then
        echo "Stack:      not up (no $RUN_DIR/node.env)"
        [ "$state" != PENDING ] || echo "            The job is waiting in the queue."
        [ "$state" != RUNNING ] || echo "            The job is starting the services; see $LOG_DIR/slurm-$id.out"
        return 0
    fi
    echo "Stack:      up on $NODE since $NODE_STARTED"
    if [ "$NODE" = "$HOST" ]; then
        for svc in $(services); do
            if service_alive "$svc"; then
                echo "            $svc: running (pid $(service_pid "$svc"), port $(service_port "$svc"))"
            else
                echo "            $svc: NOT running"
            fi
        done
    elif [ -n "$NODE_JOB" ] && command -v squeue >/dev/null 2>&1 && [ -z "$(job_state "$NODE_JOB")" ]; then
        echo "            but job $NODE_JOB has ended, so this is stale: the job was killed"
        echo "            before it could stop the stack. Submit again."
        return 0
    fi
    print_access
}

cmd_wait() {
    local limit=${1:-300} waited=0 id="" state=""
    while [ "$waited" -lt "$limit" ]; do
        id=$(job_id) || id=""
        if read_node_file && { [ -z "$id" ] || [ -z "$NODE_JOB" ] || [ "$NODE_JOB" = "$id" ]; }; then
            cmd_status
            return 0
        fi
        if [ -n "$id" ] && command -v squeue >/dev/null 2>&1; then
            state=$(job_state "$id")
            [ -n "$state" ] || die "Job $id ended before the stack came up; see $LOG_DIR/slurm-$id.out"
        fi
        sleep 5
        waited=$((waited + 5))
    done
    log "Not up after $limit seconds (job ${id:-?} is ${state:-unknown}). That is normal while the job waits in the queue or pulls images; check later with '$0 status'."
}

usage() {
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

main() {
    local command=${1:-}
    [ $# -eq 0 ] || shift
    case $command in
        pull|submit|cancel|status|wait|start|stop|check|render)
            load_config
            "cmd_$command" "$@"
            ;;
        ""|help|-h|--help) usage ;;
        *) usage >&2; exit 2 ;;
    esac
}

main "$@"
