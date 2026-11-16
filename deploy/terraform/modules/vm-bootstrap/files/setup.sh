#!/bin/bash
# Prepares the machine: data disk, Docker, the systemd units. Every step
# checks before it acts, so running this again changes nothing.
set -euo pipefail

# shellcheck source=/dev/null
. /etc/tersect/deploy.env
# shellcheck source=/dev/null
. /usr/local/lib/tersect/cloud.sh

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"
DATA_DIR="$TERSECT_DATA_DIR"

log() { echo "[tersect-setup] $*"; }
die() { log "ERROR: $*"; exit 1; }

retry() {
    local attempt
    for attempt in 1 2 3 4 5; do
        "$@" && return 0
        log "attempt $attempt failed: $*"
        sleep $((attempt * 10))
    done
    return 1
}

# --- Data disk ---------------------------------------------------------------

find_data_device() {
    local candidate
    # The disk is attached shortly after the machine starts; wait up to 5 minutes.
    for _ in $(seq 1 60); do
        for candidate in $TERSECT_DATA_DEVICES; do
            if [ -b "$candidate" ]; then
                readlink -f "$candidate"
                return 0
            fi
        done
        sleep 5
    done
    return 1
}

mount_data_disk() {
    if mountpoint -q "$DATA_DIR"; then
        log "$DATA_DIR is already mounted"
        return 0
    fi

    local device fstype status uuid
    device=$(find_data_device) || die "the data disk did not appear (looked for: $TERSECT_DATA_DEVICES)"
    udevadm settle || true

    # Low-level probe: exit 0 = something is on the disk, 2 = nothing found.
    # Anything else is an error, and an error must never lead to mkfs.
    set +e
    fstype=$(blkid -p -o value -s TYPE "$device")
    status=$?
    set -e

    if [ "$status" -eq 2 ]; then
        log "$device is empty; creating an ext4 file system"
        mkfs.ext4 -q -L tersect-data -m 0 "$device" </dev/null
    elif [ "$status" -ne 0 ]; then
        die "could not inspect $device (blkid exit $status); refusing to touch it"
    elif [ "$fstype" != "ext4" ]; then
        die "$device holds '${fstype:-a partition table or unknown data}', not ext4; refusing to touch it"
    else
        log "$device already has an ext4 file system; keeping it"
    fi

    uuid=$(blkid -o value -s UUID "$device")
    [ -n "$uuid" ] || die "no UUID on $device"
    if ! grep -q "UUID=$uuid " /etc/fstab; then
        # nofail: a missing disk must not stop the boot (there would be no way
        # in to repair it). Docker refuses to start without the mount instead.
        echo "UUID=$uuid $DATA_DIR ext4 defaults,nofail,x-systemd.device-timeout=180s 0 2" >> /etc/fstab
    fi
    mkdir -p "$DATA_DIR"
    systemctl daemon-reload
    mount "$DATA_DIR"
    mountpoint -q "$DATA_DIR" || die "$DATA_DIR did not mount"
}

# --- Packages and Docker -----------------------------------------------------

install_base_packages() {
    local missing=0 tool
    for tool in curl jq python3 gpg; do
        command -v "$tool" >/dev/null 2>&1 || missing=1
    done
    if [ "$missing" -eq 1 ]; then
        retry apt-get update -q
        retry apt-get install -y -q ca-certificates curl jq python3 gnupg
    fi
}

install_docker() {
    # Docker must never start without the data disk: containers restart by
    # themselves at boot and would write to the root disk.
    install -d -m 0755 /etc/systemd/system/docker.service.d
    cat > /etc/systemd/system/docker.service.d/10-tersect-data.conf <<UNIT
[Unit]
RequiresMountsFor=$DATA_DIR
UNIT

    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        log "Docker is already installed"
        systemctl daemon-reload
        return 0
    fi

    log "installing Docker Engine and the compose plugin"
    install -m 0755 -d /etc/apt/keyrings
    retry curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck source=/dev/null
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    retry apt-get update -q
    retry apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl daemon-reload
    systemctl enable --now docker
}

# --- systemd units -----------------------------------------------------------

install_units() {
    cat > /etc/systemd/system/tersect.service <<UNIT
[Unit]
Description=Tersect Browser (docker compose in /opt/tersect)
Documentation=file:///opt/tersect/docker-compose.yml
# Wants, not Requires: the GPU setup restarts Docker in the middle of a start.
Wants=docker.service network-online.target
After=docker.service network-online.target
RequiresMountsFor=$DATA_DIR

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=HOME=/root
ExecStart=/usr/local/sbin/tersect-sync --boot
ExecStop=/usr/bin/docker compose --project-directory /opt/tersect down
# The first start pulls several GB of images (and the model with the assistant).
TimeoutStartSec=0
TimeoutStopSec=180

[Install]
WantedBy=multi-user.target
UNIT

    cat > /etc/systemd/system/tersect-sync.service <<UNIT
[Unit]
Description=Tersect Browser: apply a changed configuration (image tags, passwords, allowlist)
Wants=docker.service network-online.target
After=docker.service network-online.target tersect.service
RequiresMountsFor=$DATA_DIR

[Service]
Type=oneshot
Environment=HOME=/root
ExecStart=/usr/local/sbin/tersect-sync
TimeoutStartSec=0
UNIT

    cat > /etc/systemd/system/tersect-sync.timer <<UNIT
[Unit]
Description=Tersect Browser: check for a changed configuration

[Timer]
OnBootSec=${TERSECT_POLL_MINUTES}min
OnUnitInactiveSec=${TERSECT_POLL_MINUTES}min
RandomizedDelaySec=20

[Install]
WantedBy=timers.target
UNIT

    systemctl daemon-reload
    systemctl enable tersect.service tersect-sync.timer
    systemctl start tersect-sync.timer
}

# --- Main --------------------------------------------------------------------

mount_data_disk
install_base_packages
install_docker
cloud_prepare

install_units
# Not waited for: the first start can take a long time, and it fails until the
# images have been pushed (the timer then retries).
systemctl start --no-block tersect.service
log "done; follow the start with: journalctl -fu tersect -u tersect-sync"
