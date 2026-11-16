# vm-bootstrap

The boot script of the machine, shared by the AWS and Google Cloud modules
(they call this module themselves; an environment does not). It creates no
resources: it renders one bash script.

The script only writes files and then runs `setup.sh`. The logic is in
`files/`, as plain scripts without templating:

| On the machine | Source | What it does |
|---|---|---|
| `/etc/tersect/deploy.env` | generated | Names of things: data device, secret id, region or project, registry host. No secrets. |
| `/usr/local/lib/tersect/cloud.sh` | the cloud module | Three functions: `cloud_prepare`, `cloud_fetch_bundle`, `cloud_registry_login`. |
| `/usr/local/lib/tersect/setup.sh` | `files/setup.sh` | Mounts the data disk, installs Docker Engine and the compose plugin, installs the systemd units. Every step checks first, so it can run at every boot. |
| `/usr/local/sbin/tersect-sync` | `files/tersect-sync.sh` | Fetches the bundle, unpacks it when it changed, logs in to the registry, `docker compose pull` and `up -d`. |
| `/usr/local/lib/tersect/unpack.py` | `files/unpack.py` | Unpacks the bundle into `/opt/tersect`; removes access-control snippets that are no longer in it. |
| `/usr/local/lib/tersect/gpu.sh` | `files/gpu.sh` | NVIDIA driver and container toolkit. Only runs when the assistant is on. |

systemd units it installs:

- **`tersect.service`** starts the stack at boot (`tersect-sync --boot`) and
  stops it at shutdown (`docker compose down`).
- **`tersect-sync.timer`** runs `tersect-sync` every `config_poll_minutes`. It
  does nothing unless the bundle differs from the last one applied
  successfully, so a failed run (for example images not pushed yet) is tried
  again at the next tick.
- A drop-in makes **`docker.service`** require the data mount, so containers
  can never start against an empty `/data` on the system disk.

## The data disk

`setup.sh` waits for the first of `data_device_candidates` to appear, then
probes it with `blkid -p`:

- nothing on it: `mkfs.ext4`;
- an ext4 file system: kept as it is;
- anything else, or a probe error: stop. It never formats a disk it cannot
  positively identify as empty.

It is mounted by UUID with `nofail`, and the file system is grown at boot when
the disk was enlarged.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | Name of the deployment (the resource prefix of the cloud module). |
| `data_device_candidates` | `list(string)` | **required** | Device paths under which the data disk may appear, most specific first (for example /dev/disk/by-id/...). The first one that exists is used. |
| `data_dir` | `string` | `"/data"` | Mount point of the data disk. Must match TB_DATA_DIR of the stack configuration. |
| `cloud_hooks` | `string` | **required** | A bash file that defines three functions for this cloud: cloud_prepare (install what the others need), cloud_fetch_bundle (print the configuration bundle to standard output) and cloud_registry_login (log Docker in to the image registry). It may read the settings of cloud_settings. |
| `cloud_settings` | `map(string)` | `{}` | Settings for the hooks, written to /etc/tersect/deploy.env as TERSECT_<KEY>=value. Names of things only, never secrets: this ends up in instance metadata. |
| `config_poll_minutes` | `number` | `5` | How often the machine checks the secret store for a changed configuration bundle. |

## Outputs

| Name | Description |
|---|---|
| `script` | The boot script (bash). Pass it as EC2 user data or as the startup-script metadata of a Compute Engine instance. It contains no secrets. |
| `script_sha256` | Hash of the script, to see at a glance whether it changed. |
