# Tersect Browser on an HPC cluster (Slurm + Apptainer)

The production stack of `deploy/compose/docker-compose.yml`, run without
Docker and without root: the same five images, converted to Apptainer SIF
files, started as ordinary processes of your own user inside one Slurm job on
one compute node. Everything listens on that node's localhost; people reach
it through an SSH tunnel and a shared password.

> **Status: never run on a real cluster.** The pieces were tested as far as
> that is possible without one (see [What was tested](#what-was-tested)), but
> Apptainer and Slurm are configured differently at every site. Work through
> [Before the first run](#before-the-first-run) and expect to adjust.

| File | |
|---|---|
| `tersect-stack.sh` | The launcher: `pull`, `submit`, `status`, `wait`, `cancel`, and on the node `start`, `check`, `stop`, `render` |
| `tersect.sbatch` | The Slurm job: starts the stack, watches it, stops it cleanly, queues itself again at the time limit |
| `bind-localhost.cjs` | Keeps the backend on localhost (below) |
| `stack.env.example`, `secrets.env.example` | Settings and passwords, for running without Terraform |

`deploy/terraform/environments/hpc` installs all of this over SSH and submits
the job; [by hand](#by-hand-without-terraform) it is five commands.

## How it works

```
your computer ── ssh tunnel ──> login node ──> compute node (one Slurm job)
                                                 web (Caddy)   :8080   password, static app, proxy
                                                 backend       :14300  ┐
                                                 builder       :14310  │ 127.0.0.1 only
                                                 MongoDB       :27117  │
                                                 ClickHouse    :18123, :19000
                                                 Ollama        :21434  ┘ (optional)
```

The deployment directory (on a filesystem all nodes share):

```
tersect-stack.sh  tersect.sbatch  stack.env  secrets.env (0600)
config/    schema.sql, low-memory.xml (from clickhouse/), bind-localhost.cjs
images/    *.sif, one per image, with the reference each was pulled from
run/       written at every start: env files, ClickHouse and Caddy config,
           pid files, owner, node.env (where it runs), job.id
logs/      slurm-<job>.out, one log per service, clickhouse/
data/      tersect/ (datasets, uploads, builds)  shared/  mongo/  clickhouse/  caddy/  ollama/
```

**Images.** `pull` runs `apptainer pull docker://<image>` for each image into
`images/`, with Apptainer's cache and temporary space inside the deployment
directory (home quotas are small) and removed afterwards. An image that is
already there with the same reference is skipped; `pull --force` fetches
again (needed after re-pushing the same tag). An image setting may also be
any URI Apptainer understands (`oras://...`) or the absolute path of a `.sif`
file, for clusters with no route to a registry: build the SIF elsewhere and
copy it over. Registry credentials (`APPTAINER_DOCKER_USERNAME` / `PASSWORD`
in `secrets.env`) are sent only to the registry the web image is on.

**Services.** Each one is `apptainer exec` in the background, a child of the
job, with `--containall --no-home` (no host home, `/tmp` or environment; own
PID namespace), its settings in an `--env-file` of mode 0600, its data
folders bound in, its own `/tmp` under `run/tmp/`, and its output in
`logs/<service>.log`. Plain processes rather than `apptainer instance start`:
Slurm then tracks and cleans them up like any other process of the job,
their logs go where we choose rather than under `~/.apptainer`, and instance
start-up is the part of Apptainer that most often fails inside batch jobs
(it wants a systemd user session for cgroups on some sites). The trade-off is
that there is no `apptainer instance list`; `tersect-stack.sh status` on the
node plays that role.

What differs from the compose stack, and why:

| | compose | here |
|---|---|---|
| Network | a private Docker network; only Caddy is published | no network namespace without root, so every service is told to listen on 127.0.0.1 and on its own port |
| Backend | `npx tsx server-dev.ts` listens on all interfaces | the same program started as `./node_modules/.bin/tsx` (npx wants a writable home), with `bind-localhost.cjs` preloaded so that `listen(port)` becomes `listen(port, '127.0.0.1')` |
| Builder | `python -m tbpipeline.server` listens on 0.0.0.0 | the same uvicorn call with `host=127.0.0.1`; `TB_BUILD_CORES` set to the job's CPUs, because Python sees the whole node's |
| MongoDB | users created by `docker-entrypoint-initdb.d` | `mongod --auth --bind_ip 127.0.0.1`; on every start a script creates the root user through the localhost exception if there are no users yet, then creates or updates the application user |
| ClickHouse | entrypoint creates the admin user; `users.sh` the schema and reader | `clickhouse-server` directly (the entrypoint expects root). `config.d` and `users.d` of the image are replaced by generated ones: listen on 127.0.0.1, own ports, MySQL/PostgreSQL/interserver ports removed, admin user as a SHA-256 hash; then the launcher applies `schema.sql` and creates the reader, at every start |
| Caddy | ports 80/443, TLS | `TB_SITE_ADDRESS=:8080`, plain HTTP, `bind <address>` and `basic_auth` snippets in `site.d`. The password hash is made at start with `caddy hash-password` from the image, fed through stdin |
| Passwords | in `.env` | in `secrets.env` and `run/env/*.env`, all mode 0600; never on a command line, where other users of the node could read them with `ps` |

The backend and builder images are read-only under Apptainer, so those two
run with `--writable-tmpfs` (a small in-memory overlay) for the few files the
analysis tools write beside their code.

**The job.** `tersect.sbatch` starts the stack, then checks every 30 seconds
that all services are alive; if one dies it stops the rest and ends with an
error (it does not restart in a loop). Slurm warns it `TB_STOP_GRACE` seconds
(default 300) before the time limit (`--signal=B:TERM@300`), and
`tersect-stack.sh cancel` sends the same signal to the batch script only
(`scancel --batch --signal=TERM`). Either way the script stops the services
in order: web, builder, backend, then ClickHouse (`SYSTEM SHUTDOWN`) and
MongoDB (`shutdownServer`), each with SIGTERM and finally SIGKILL as
fallbacks. If the signal came at the time limit and `TB_AUTO_RESUBMIT=1`, it
queues itself again; after a cancel or a failure it does not.

A plain `scancel <job>` also works but gives the databases only Slurm's
`KillWait` (often 30 seconds) before SIGKILL. Both databases recover from
that, but prefer `tersect-stack.sh cancel`.

Only one job may run a deployment: a start claims `run/owner`, a second job
waits three minutes for the first to finish and then gives up without
touching anything.

**Builds run inside the job.** The builder starts dataset builds (Snakemake,
bcftools, snpEff, Tersect) as its own subprocesses, so they use the job's
CPUs and memory together with the databases. The defaults (8 CPUs, 32 GB)
are sized for that; 16 GB is enough only for browsing. A build that is
running when the job ends is killed. Ask for the longest time limit your
partition allows, and start long builds soon after a restart.

## Access

The app has no accounts, so the password is not optional here: anyone on the
cluster can connect to a port on a compute node.

`status` prints the tunnel command with the current node filled in. The node
can change every time the job restarts.

*Default, `TB_BIND_ADDRESS=127.0.0.1`.* The site is reachable only from the
compute node itself, so the tunnel has to end there:

    ssh -N -L 8080:127.0.0.1:8080 -J you@login.example.org you@node042

This needs SSH access to compute nodes, which most clusters allow while you
have a job on the node (`pam_slurm_adopt`). Only you, and people you give the
password to and who can do the same, get as far as the password prompt.

*`TB_BIND_ADDRESS=0.0.0.0`* (or the node's address on the cluster network).
The tunnel ends on the login node, which then connects to the compute node:

    ssh -N -L 8080:node042:8080 you@login.example.org

Works where compute nodes refuse SSH, but every machine on the cluster
network can reach the password prompt, and the password crosses that network
unencrypted. Only the web port is opened this way; the databases and the
application services stay on 127.0.0.1.

Keep the local port (8080, `TB_TUNNEL_LOCAL_PORT`) as printed: the app builds
download links from `TB_PUBLIC_URL`, which is `http://localhost:8080`.

To let colleagues in, give them the password; each opens their own tunnel
with their own cluster account.

## Storage: shared filesystems and the databases

Dataset files (`data/tersect`) are large, written once and read sequentially;
any shared filesystem is fine for them.

MongoDB and ClickHouse are another matter. Both rely on `fsync`, file locks
and many small writes. On NFS and Lustre that is slower, MongoDB's
documentation advises against NFS, and the lock that stops two servers from
opening the same files is not reliable there (which is why the launcher has
its own `run/owner` claim). Two choices:

*Default: databases in `data/` on the shared filesystem.* Nothing is lost
when a job dies, whichever node the next job lands on. Slower loads and
searches; how much depends on the filesystem (untested). If your site has a
project filesystem that is not Lustre scratch, prefer it, and check that
scratch is not purged by age: an untouched ClickHouse part file can be months
old.

*`TB_NODE_LOCAL_DIR` (`node_local_dir`): databases on the node's own disk.*
Set it to a directory that exists on the compute nodes (`/local/scratch`) or
to the name of a variable Slurm sets in jobs (`$TMPDIR`). At start the two
database folders are copied (rsync) to the node, at stop they are copied
back. Fast, and correct as long as the job ends through its signal handler.
The risks:

- If the node crashes or the job is killed without warning, everything the
  databases received since the job started is gone, while dataset files
  written in that time remain in `data/tersect`. The launcher notices at the
  next start (`data/.node-local-active`), refuses to continue and tells you
  what to do; it does not silently fall back to the older copy.
- The copy back must fit in `TB_STOP_GRACE`. ClickHouse holds every variant
  of every dataset, so this can be tens of GB: raise the grace time, and
  check that node-local disk is big enough and survives until the job's end.

Whatever you choose, back up `data/` with the stack stopped
(`tersect-stack.sh cancel`, copy, `submit`).

## Dataset assistant

Off by default. Two ways to turn it on:

- **A model server that already exists** (the university's own, a lab GPU
  box): set `TB_ASSISTANT_URL` to its OpenAI-compatible base URL including
  `/v1`, `TB_ASSISTANT_MODEL`, and `TB_ASSISTANT_API_KEY` in `secrets.env` if
  it needs one. It must be reachable from the compute nodes. Nothing extra
  runs in the job.
- **Ollama inside the job:** `TB_RUN_OLLAMA=1` and a GPU for the job
  (`--gres=gpu:1`). The launcher starts the Ollama image with `--nv` when the
  node has `nvidia-smi`, with models in `data/ollama`, and points the builder
  at it. `pull` on the login node downloads the model too (it starts a
  temporary server for that), because compute nodes often cannot. Without a
  GPU it runs on CPUs and is too slow to be useful. A 14b model also needs
  about 10 GB of GPU memory.

## By hand, without Terraform

On the login node:

    mkdir -p /project/mygroup/tersect/config && cd /project/mygroup/tersect
    # from a checkout of this repository:
    cp <repo>/deploy/hpc/{tersect-stack.sh,tersect.sbatch} .
    cp <repo>/deploy/hpc/bind-localhost.cjs <repo>/clickhouse/{schema.sql,low-memory.xml} config/
    cp <repo>/deploy/hpc/stack.env.example stack.env        # edit: images, ports, paths
    cp <repo>/deploy/hpc/secrets.env.example secrets.env    # edit: passwords
    chmod 700 . tersect-stack.sh && chmod 600 secrets.env

Edit the `#SBATCH` lines between the two markers in `tersect.sbatch`
(partition, account, time, CPUs, memory). Then:

    ./tersect-stack.sh pull       # images -> images/*.sif (on a node with internet)
    ./tersect-stack.sh submit     # queue the job
    ./tersect-stack.sh status     # where it runs, and the tunnel command
    ./tersect-stack.sh cancel     # stop it cleanly; data stays

To try it without the scheduler, in an interactive allocation
(`salloc --cpus-per-task=8 --mem=32G`, then on the node):
`./tersect-stack.sh start`, `status`, `stop`.

Logs: `logs/slurm-<job>.out` for the job and the launcher's messages,
`logs/<service>.log` for each service, `logs/clickhouse/` for ClickHouse's
own files.

## Before the first run

Check these on your cluster first; each is something that differs between
sites and that this setup depends on.

1. **Policy.** Is a long-running service in a batch job allowed, and on which
   partition? Many sites forbid it or have a dedicated "services" partition
   or VM offering that is a better home for this.
2. **Apptainer works for you, in a job:** `apptainer exec docker://alpine id`
   inside `srun`. Note the version (`apptainer --version`; 1.1 or newer
   expected, SingularityCE 3.8+ should work with `TB_APPTAINER=singularity`)
   and whether it needs `module load`.
3. **`--containall`, binds and overlays:** `apptainer exec --containall
   --no-home --writable-tmpfs --bind $PWD:/data/x docker://alpine sh -c
   'touch /data/x/t /etc/t && echo ok'`. This needs user namespaces (or a
   setuid installation) and overlay or underlay support to create the mount
   points `/data/tersect`, `/data/shared` and `/opt/tersect` that the images
   do not contain. If `--writable-tmpfs` fails, the backend and builder are
   the services affected.
4. **Where pulls can run.** Is the registry reachable from the login node,
   and may you run `mksquashfs` there for several minutes (the backend image
   is about 9 GB uncompressed)? If not, use `TB_PULL_ON=job` if the compute
   nodes have internet, or build the SIF files elsewhere.
5. **Docker Hub limits.** `mongo`, `clickhouse/clickhouse-server` and
   `ollama/ollama` come from Docker Hub, which limits anonymous pulls per IP
   address; a login node shares its address with everyone. Mirror them to
   your registry if pulls are refused.
6. **Time limits and signals.** The partition's maximum wall time; whether
   `--signal=B:TERM@300` is honoured (it is standard); `scontrol show config
   | grep -i -E 'killwait|proctrack'` (the launcher starts services in their
   own sessions, which `proctrack/pgid` would lose track of; the common
   `proctrack/cgroup` is fine).
7. **SSH to compute nodes** while you have a job there. If not allowed, use
   `TB_BIND_ADDRESS=0.0.0.0`.
8. **Ports.** They are per node, not per user. If another deployment (or
   anything else) on the node holds one, the start fails with a message
   naming it; change it in `stack.env`.
9. **Open files.** `ulimit -Hn` on a compute node. ClickHouse wants many
   (Docker gives it 262144); the launcher raises the soft limit to the hard
   limit, and a hard limit of 4096 will hurt with many datasets.
10. **Memory accounting.** With cgroup enforcement, the job is killed when
    databases plus a build exceed `--mem`. Watch `sacct -j <job> -o MaxRSS`
    during the first real build.
11. **The filesystem** under `data/`: type (`df -T`), quota, purge policy.
    See [Storage](#storage-shared-filesystems-and-the-databases).
12. **CPU architecture.** The backend image is linux/amd64 only; MongoDB 8
    needs AVX. Old or ARM nodes will not do.

## What was tested

There was no cluster to test on. What was done instead, on a laptop:

- `bash -n` and shellcheck on both scripts, and on the job script as
  Terraform renders it.
- The generated configuration against the real images, each run with Docker
  as an unprivileged user on a read-only root filesystem (the closest Docker
  gets to Apptainer's conditions):
  - ClickHouse 25.8 with the generated `config.d` and `users.d`: listens only
    on 127.0.0.1 on the two chosen ports, admin login from the environment,
    `default` user gone, schema and reader user applied twice without error,
    reader can select over HTTP and cannot write, `SYSTEM SHUTDOWN` stops it.
  - MongoDB 8.0: first-start user creation through the localhost exception,
    second run a no-op, the application user can write its database and
    nothing else, anonymous access refused, the shutdown script stops it.
  - The web image: the real Caddyfile validates with the generated `site.d`;
    it listens on 127.0.0.1:8080 only, answers 401 without the password and
    200 with it, and proxies to `127.0.0.1:<backend port>`. Password hashing
    through stdin works.
  - The backend image: with `bind-localhost.cjs`, `app.listen(PORT)` under
    tsx listens on 127.0.0.1 (and on `::` without it).
  - The pipeline image: the builder's start command listens on 127.0.0.1 and
    serves `/api/config` with MongoDB reached through the generated URL.
- The launcher and job logic, and the Terraform provisioners, against a
  throwaway SSH container with **fake** `sbatch`/`squeue`/`scancel` and a
  **fake** `apptainer` (listeners instead of services): upload, permissions,
  pull bookkeeping, start order, readiness, status and tunnel output, clean
  cancel, the SIGTERM fallback, resubmission at the time limit, refusal of a
  second job, recovery after a job killed outright, redeployment on change,
  destroy keeping the data, and the node-local mode (copy in, copy back, a
  failed copy back, a lost node).

Not tested, because it needs the real thing:

- Anything Apptainer does: pulling and converting these images, `--containall`,
  bind-mount creation, `--writable-tmpfs`, `--env-file` parsing, `--nv`,
  signal delivery to contained processes, and whether the image's programs
  behave as an unprivileged user with Apptainer's `/etc/passwd` and `/dev`.
- The backend as a whole under Apptainer: the analysis tools (R, Julia,
  PhyloNet, rapidNJ) writing where they expect to; Julia with its package
  depot on a read-only image is the likeliest to need attention.
- A real dataset build inside the job (Snakemake, snpEff downloads, memory).
- Real Slurm: the header's acceptance, signal timing, `SLURM_JOB_END_TIME`
  (the script falls back to `squeue`), resubmission from inside a job,
  cgroup limits.
- MongoDB and ClickHouse on NFS or Lustre. The node-local mode's copy in and
  out was exercised only in the simulation, with a few small files.
- Ollama in any form.
- Module loading (`TB_MODULES`) on Lmod or Environment Modules.

## Limits

- One node, one job: no high availability. At every job end the site is down
  until the next job leaves the queue, and the node name (so the tunnel
  command) may change.
- A running build is killed when the job ends.
- A mutable tag is not pulled again unless you use `pull --force`.
- The MongoDB root password and the ClickHouse data are created on first
  start; changing the root password in `secrets.env` afterwards locks the
  launcher out (the application and ClickHouse passwords are updated at
  every start and may be changed).
- Logs are rotated only at start (a service log over 50 MB is moved to
  `.1`).
