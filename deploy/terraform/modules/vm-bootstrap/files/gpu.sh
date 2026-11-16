#!/bin/bash
# NVIDIA driver and container toolkit, for the dataset assistant's model.
# Called by tersect-sync when the assistant is switched on; does nothing once
# both are in place.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
STATE_DIR=/var/lib/tersect
REBOOTED="$STATE_DIR/gpu-rebooted"

log() { echo "[tersect-gpu] $*"; }

mkdir -p "$STATE_DIR"

if ! nvidia-smi >/dev/null 2>&1; then
    log "installing the NVIDIA driver"
    apt-get update -q
    apt-get install -y -q ubuntu-drivers-common
    # The server driver build that matches the running cloud kernel, without
    # the desktop parts.
    ubuntu-drivers install --gpgpu

    # --gpgpu leaves out nvidia-smi and the libraries containers need;
    # install the utilities of the same driver series (for example 570-server).
    series=$(dpkg-query -W -f '${Package}\n' 'nvidia-headless-no-dkms-*' 2>/dev/null \
        | sed -n 's/^nvidia-headless-no-dkms-//p' | sort -V | tail -n 1)
    if [ -z "$series" ]; then
        log "ERROR: no NVIDIA driver was installed. Is this a GPU machine type?"
        exit 1
    fi
    apt-get install -y -q "nvidia-utils-$series"

    modprobe nvidia >/dev/null 2>&1 || true
    if ! nvidia-smi >/dev/null 2>&1; then
        if [ ! -e "$REBOOTED" ]; then
            log "the driver needs a reboot to load; rebooting once"
            touch "$REBOOTED"
            systemctl reboot
            exit 1
        fi
        log "ERROR: nvidia-smi still fails after a reboot; see 'dmesg | grep -i nvidia'"
        exit 1
    fi
fi

if ! command -v nvidia-ctk >/dev/null 2>&1; then
    log "installing the NVIDIA container toolkit"
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        > /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update -q
    apt-get install -y -q nvidia-container-toolkit
fi

if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q nvidia; then
    log "registering the NVIDIA runtime with Docker"
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
fi
