#!/bin/bash
# Tersect Browser as one Slurm job: starts the stack on the node the job gets,
# keeps it running, and stops it cleanly when the job is cancelled or reaches
# its time limit (then, with TB_AUTO_RESUBMIT=1, queues itself again).
#
# Submit it from the deployment directory, normally with
# './tersect-stack.sh submit'. The Terraform module replaces the block between
# the two markers with the options it was given; by hand, edit them here.
#
# Dataset builds run inside this job, so the CPUs and memory below are what a
# build gets, shared with the databases.
#
#@TB_SBATCH_BEGIN
#SBATCH --job-name=tersect
#SBATCH --output=logs/slurm-%j.out
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=1-00:00:00
#SBATCH --signal=B:TERM@300
#@TB_SBATCH_END

set -euo pipefail

DEPLOY_DIR=${TB_DEPLOY_DIR:-${SLURM_SUBMIT_DIR:-$PWD}}
STACK=$DEPLOY_DIR/tersect-stack.sh
[ -x "$STACK" ] || { echo "No tersect-stack.sh in $DEPLOY_DIR; submit from the deployment directory." >&2; exit 1; }
export TB_DEPLOY_DIR=$DEPLOY_DIR

# Only the settings this script itself needs; the launcher reads the rest.
# shellcheck source=/dev/null
. "$DEPLOY_DIR/stack.env"
: "${TB_AUTO_RESUBMIT:=0}" "${TB_STOP_GRACE:=300}" "${TB_PULL_ON:=login}"

say() { printf '[tersect job %s %s] %s\n' "${SLURM_JOB_ID:-?}" "$(date '+%F %T')" "$*"; }

# Seconds until Slurm ends the job, or nothing if that cannot be found out.
# shellcheck disable=SC2329  # called from the trap
seconds_left() {
    local end=${SLURM_JOB_END_TIME:-} text
    if [ -z "$end" ]; then
        text=$(squeue -h -j "$SLURM_JOB_ID" -o %e 2>/dev/null | head -n 1) || return 0
        end=$(date -d "$text" +%s 2>/dev/null) || return 0
    fi
    echo $((end - $(date +%s)))
}

stop_requested=0
at_time_limit=0
# shellcheck disable=SC2329  # the trap handler
on_signal() {
    local left
    [ "$stop_requested" = 0 ] || return 0
    stop_requested=1
    # Slurm sends this signal TB_STOP_GRACE seconds before the time limit
    # (--signal above); 'tersect-stack.sh cancel' and scancel send it any time.
    # Only the first case is a reason to queue the job again.
    left=$(seconds_left)
    if [ -n "$left" ] && [ "$left" -le $((TB_STOP_GRACE + 90)) ]; then
        at_time_limit=1
    fi
    say "Asked to stop (${left:-unknown} seconds of the time limit left)."
}
trap on_signal TERM INT

say "Starting on ${SLURMD_NODENAME:-$(hostname)} with ${SLURM_CPUS_PER_TASK:-?} CPUs."

status=0
if [ "$TB_PULL_ON" = job ]; then
    "$STACK" pull || status=1
fi
if [ "$status" = 0 ]; then
    "$STACK" start || status=$?
fi
if [ "$status" = 3 ]; then
    # Another job runs this deployment; nothing here is ours to stop.
    say "This deployment is held by another job; leaving it alone."
    exit 1
fi

if [ "$status" = 0 ]; then
    # Bash runs a trap only between commands, so the wait is a background
    # sleep: 'wait' returns as soon as the signal arrives.
    while [ "$stop_requested" = 0 ]; do
        sleep 30 &
        sleeper=$!
        wait "$sleeper" || true
        kill "$sleeper" 2>/dev/null || true
        [ "$stop_requested" = 0 ] || break
        if ! "$STACK" check; then
            say "A service has died; stopping the rest. See $DEPLOY_DIR/logs/."
            status=1
            break
        fi
    done
else
    say "The stack did not start."
fi

"$STACK" stop || status=1

if [ "$status" = 0 ] && [ "$at_time_limit" = 1 ] && [ "$TB_AUTO_RESUBMIT" = 1 ]; then
    say "Time limit reached; queueing the next job."
    "$STACK" submit || status=1
fi
say "Done (status $status)."
exit "$status"
