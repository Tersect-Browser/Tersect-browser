# hpc-slurm

Tersect Browser on a university cluster: the production stack as one Slurm
job of your own user, run with Apptainer (no Docker, no root), reached
through an SSH tunnel. What runs on the cluster, and how, is described in
[`deploy/hpc/README.md`](../../../hpc/README.md); this page is about the
Terraform side.

> **Never run on a real cluster.** Checked with `tofu validate`, plan-only
> tests, and an apply/redeploy/destroy cycle against a throwaway SSH container
> with fake Slurm and Apptainer commands. Read "Before the first run" in
> `deploy/hpc/README.md` before pointing it at a real one.

## What Terraform does here, and why with provisioners

A cluster has no API for Terraform to talk to: Slurm is driven by `sbatch`
on a login node, as you. So this module does the only thing it can:

1. generates the passwords (`random_password`);
2. renders the deployment directory: `stack.env`, `secrets.env`, the job
   script with your `#SBATCH` options, the launcher and the configuration
   files from `deploy/hpc` and `clickhouse/`;
3. in one `terraform_data` resource, uploads it over SSH (`file`
   provisioners), pulls the images on the login node and submits the job
   (`remote-exec`);
4. on destroy, cancels the job cleanly (a destroy-time `remote-exec`).

Provisioners are Terraform's last resort: it cannot see what they did, cannot
plan their effect, and a failure half-way leaves the resource tainted. They
are justified here because there is no alternative that keeps the three
environments (AWS, Google Cloud, HPC) driven the same way, and their
drawbacks are contained:

- everything the provisioners run is idempotent (`pull` skips images that
  are there, `submit` refuses a second job, `cancel` is a no-op without a
  job), so re-running a tainted resource is safe;
- the resource is replaced whenever the rendered content changes
  (`triggers_replace` holds a hash of every file and setting), which means:
  cancel the job, upload, submit again. **Any change restarts the stack** and
  kills a build in progress;
- Terraform's state says "installed and submitted", not "running". The truth
  is on the cluster: `status_command`.

**Destroy keeps the data.** `terraform destroy` cancels the job and removes
nothing: the deployment directory, the images and `data_dir` stay. Delete
them by hand when you are sure. (Destroying also forgets the generated
passwords; a later apply on the same `data_dir` generates new ones, which the
existing MongoDB will not accept. Keep the state, or keep `secrets.env`.)

If you would rather not use Terraform for this, `deploy/hpc/README.md` shows
the five commands that do the same by hand.

## SSH

Authentication is by SSH agent (default) or a key file
(`ssh_private_key_path`, no passphrase). Passwords and keyboard-interactive
logins are not supported, so a cluster that demands a one-time code for
every connection needs an already-open, multiplexed route (for example
`ssh_bastion_host` to a gateway you can reach with a key) or the by-hand
route. Only the key's path is stored in the state.

Terraform's SSH client does not read `~/.ssh/config` or `known_hosts`. Give
`ssh_host_key` to have the login node verified; give `ssh_bastion_*` instead
of a `ProxyJump` line.

Remote commands run through `bash -lc`, so that the login profile puts
`sbatch` and (with `environment_modules`) `apptainer` on the PATH.

## Use

```hcl
module "tersect" {
  source = "../../modules/hpc-slurm"

  login_host = "login.hpc.example.org"
  ssh_user   = "abc123"
  deploy_dir = "/project/mygroup/tersect"

  image_web      = "registry.example.org/tersect/web:1.0.0"
  image_backend  = "registry.example.org/tersect/backend:1.0.0"
  image_pipeline = "registry.example.org/tersect/pipeline:1.0.0"

  partition  = "long"
  time_limit = "7-00:00:00"
}
```

Then:

    terraform output -raw status_command | sh      # where it runs + the tunnel command
    terraform output -raw basic_auth_password

The module reads `deploy/hpc/` and `clickhouse/` of this repository by
relative path, so it is used from a checkout, not from a registry.

## Inputs

Required: `login_host`, `ssh_user`, `deploy_dir`, `image_web`,
`image_backend`, `image_pipeline`.

| Name | Default | |
|---|---|---|
| `name` | `"tersect"` | Deployment and Slurm job name |
| **SSH** | | |
| `login_host`, `ssh_user` | | Login node and your account |
| `ssh_port` | `22` | |
| `ssh_private_key_path` | `null` | Key file; null uses the SSH agent |
| `ssh_host_key` | `null` | Login node's public host key, to verify it |
| `ssh_bastion_host`, `ssh_bastion_user`, `ssh_bastion_port`, `ssh_bastion_private_key_path` | none | Jump host |
| `ssh_timeout` | `"2m"` | |
| **Paths** | | |
| `deploy_dir` | | Deployment directory on a shared filesystem (not home) |
| `data_dir` | `<deploy_dir>/data` | All persistent data; never removed |
| `shared_dir` | `<data_dir>/shared` | Read-only folder users may pick inputs from |
| `node_local_dir` | `null` | Run the databases on the node's disk (path or `"$TMPDIR"`); see the storage section of `deploy/hpc/README.md` |
| **Images** | | |
| `image_web`, `image_backend`, `image_pipeline` | | `registry/repo:tag`, an Apptainer URI, or the path of a `.sif` on the cluster |
| `image_mongo` | `"mongo:8.0"` | |
| `image_clickhouse` | `"clickhouse/clickhouse-server:25.8"` | |
| `image_ollama` | `"ollama/ollama:0.40.16"` | Only with the assistant in the job |
| `registry_username`, `registry_password` (sensitive) | `null` | Sent only to the registry of `image_web` |
| `pull_on` | `"login"` | `"login"`: pulled during apply on the login node. `"job"`: inside the job |
| **Apptainer** | | |
| `apptainer_command` | `"apptainer"` | Or `"singularity"`, or a path |
| `environment_modules` | `[]` | Modules to `module load` |
| `apptainer_flags` | `"--containall --no-home"` | Isolation options for every container |
| **Network and access** | | |
| `bind_address` | `"127.0.0.1"` | Where the site listens on the compute node; `"0.0.0.0"` lets the tunnel end on the login node |
| `http_port` | `8080` | Port of the site on the compute node |
| `service_ports` | 14300, 14310, 27117, 18123, 19000, 21434 | Localhost ports of backend, builder, mongo, clickhouse_http, clickhouse_tcp, ollama |
| `tunnel_local_port` | `8080` | Port on your computer; the app's links use it |
| `basic_auth_username` | `"tersect"` | |
| `basic_auth_password` (sensitive) | generated | 12 to 72 characters |
| **Job** | | |
| `submit_job` | `true` | False: install only, submit by hand |
| `partition`, `account`, `qos` | cluster defaults | |
| `time_limit` | `"1-00:00:00"` | Use the partition's maximum |
| `auto_resubmit` | `true` | Queue again at the time limit |
| `stop_grace_seconds` | `300` | Warning before the time limit; the time to stop cleanly |
| `cpus` | `8` | Builds run inside the job |
| `memory_gb` | `32` | Shared by databases, services and builds |
| `gres` | `null` | For example `"gpu:1"` |
| `sbatch_extra_options` | `[]` | More `#SBATCH` lines |
| `wait_for_start_seconds` | `120` | Wait this long for the stack and print the tunnel command; not an error if still queued |
| **Application** | | |
| `database_name` | `"tersect_browser_gp"` | |
| `mongo_username` | `"tersect"` | |
| `mongo_cache_gb` | `1` | |
| `clickhouse_low_memory` | `true` | `clickhouse/low-memory.xml` |
| `build_cores` | `cpus` | Cores for a dataset build |
| **Assistant** | | |
| `enable_assistant` | `false` | |
| `assistant_url` | `null` | Existing OpenAI-compatible server (with `/v1`); null runs Ollama in the job |
| `assistant_api_key` (sensitive) | `null` | |
| `assistant_model` | `"qwen3:14b"` | |
| `assistant_context_chars` | `24000` | |
| `ollama_context_length` | `16384` | |

Variables shared with the cloud environments keep their names and meaning:
`name`, `image_web`, `image_backend`, `image_pipeline`,
`basic_auth_username`, `basic_auth_password`, `enable_assistant`,
`assistant_model`, `assistant_context_chars`, `ollama_context_length`,
`data_dir`, `database_name`, `mongo_username`, `clickhouse_low_memory`.
One difference: on the cloud `enable_assistant` always starts a GPU machine
with Ollama; here it uses `assistant_url` when given, and only otherwise runs
Ollama in the job.

## Outputs

| Name | |
|---|---|
| `url` | `http://localhost:<tunnel_local_port>/TersectBrowserGP/` |
| `status_command` | SSH command that prints the job, its node and the exact tunnel command |
| `tunnel_command` | The tunnel with `NODE` as a placeholder (the node is only known once the job runs) |
| `basic_auth_username`, `basic_auth_password` (sensitive) | The shared login |
| `deploy_dir`, `data_dir` | Paths on the cluster |
| `assistant` | `off`, `external: <url>` or `ollama in the job (<model>)` |
| `sbatch_header` | The job's `#SBATCH` lines, to check against the cluster's rules |

## State

The state holds the generated passwords (and `basic_auth_password` as an
output). The registry token and the assistant key are not stored in it; they
go from the variable to `secrets.env` on the cluster. Keep the state private
(`environments/hpc/backend.tf.example`).
