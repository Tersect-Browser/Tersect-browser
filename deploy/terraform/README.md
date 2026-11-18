# Tersect Browser on AWS, Google Cloud or Oracle Cloud

Terraform that puts the production stack (`deploy/compose/docker-compose.yml`)
on one virtual machine, on AWS, on Google Cloud or on Oracle Cloud. Most of
this guide is written for the first two; what differs on Oracle Cloud, whose
free allowance is large enough for a small deployment, is in
[its own section](#first-deployment-oracle-cloud-always-free). It works with Terraform
1.6 or newer and with OpenTofu (`tofu`); the commands below say `terraform`,
`tofu` takes the same arguments.

## What you get

- **One machine** (Ubuntu 24.04 LTS) running the compose stack: the proxy with
  the web app, the backend, the builder, MongoDB and ClickHouse.
- **A separate data disk** mounted at `/data`, encrypted, with a daily
  snapshot. It survives the machine being replaced.
- **A fixed public IP address**, and optionally a DNS record.
- **HTTPS**: a real certificate when you give a domain, a self-signed one on
  the bare IP address otherwise.
- **A shared login** (one user name and password for everybody) and an
  optional list of networks that may connect.
- **No SSH port.** You get a shell through Session Manager (AWS) or
  Identity-Aware Proxy (Google Cloud).
- **A private image registry** (ECR or Artifact Registry) that the machine
  pulls from with its own role.
- Optionally, a GPU machine that also runs the dataset assistant's model.

> **There is one login, not user accounts.** Anyone who has the password can
> start builds and delete datasets. `allowed_cidrs` defaults to the whole
> internet, which leaves the shared password as the only protection. Narrow it
> to your institution's networks if you can, and give the password only to
> people you would give delete rights to.

### A public site

By default the password is asked for the whole site. With
`public_site = true` anyone can browse the datasets, and the same login is
asked only for managing them: the app shows a *Sign in* link, and the builder
service refuses every request without a session (drafts, uploads, builds,
deleting, the assistant, the server folder). The viewer does not use the
builder, so nothing a visitor does needs it.

What a public site still exposes to everyone: all listed datasets, and the
analyses a visitor can start from the viewer (trees, introgression scans),
which use the machine's CPU. There is no rate limit on those.

### What this is not

One machine, on purpose. There is no load balancer, no second zone and no
failover: when the machine or its zone is down, the site is down, and a
release or reboot means a short interruption. Backend and builder share
dataset files on one disk, so the stack cannot be spread over several
machines as it is. Builds, the databases and the web app compete for the same
CPU and memory; a large build slows the site down. The backups are daily
disk snapshots: up to a day of work can be lost.

## Layout

```
deploy/terraform/
  modules/
    stack-config/   passwords, .env, access control, the configuration bundle (no cloud)
    vm-bootstrap/   the boot script and the scripts it installs (used by the two below)
    aws-vm/         VPC, security group, role, EC2, EBS, Elastic IP, Route 53, ECR, Secrets Manager, DLM
    gcp-vm/         network, firewall, service account, instance, disk, address, Cloud DNS,
                    Artifact Registry, Secret Manager, snapshot schedule
    oci-vm/         VCN, security group, dynamic group and policy, instance, block volume,
                    reserved address, Container Registry, config bucket, backup policy
  environments/
    aws/            what you run for AWS: providers, variables, outputs
    gcp/            the same for Google Cloud
    oci/            the same for Oracle Cloud
deploy/scripts/push-images.sh   builds and pushes the three images
```

Each module has its own README with every input and output. `hpc-slurm` and
`environments/hpc` are a separate deployment and are documented on their own.

## How it works

```
 your computer                          the cloud
 ─────────────                          ─────────
 terraform apply ──► secret store:      "config bundle" = .env, docker-compose.yml,
                                        site.d/*.caddy, mongo-init.js, clickhouse/*
                 ──► machine            boot script (no secrets in it)
 push-images.sh  ──► registry           web, backend, pipeline images

 on the machine:  tersect-sync  ── every 5 minutes, and at boot ──►
                    fetch the bundle with the machine's role
                    changed?  unpack to /opt/tersect, docker compose pull, up -d
```

- **Secrets.** Terraform generates the database passwords and (unless you
  supply one) the login password. They are written into `.env` inside the
  *bundle*, which is stored as one secret (AWS Secrets Manager, Google Secret
  Manager). The machine's boot script holds only the *name* of that secret
  and fetches it with the machine's own role, which may read that one secret
  and nothing else. The login password is kept a second time, in its own
  secret, for you to read; the machine has only its bcrypt hash.
- **The state file holds all of these passwords in clear text.** Use a remote
  backend (below) and treat the state as a secret.
- **Updates are pulled, not pushed.** Applying a change updates the bundle;
  the machine notices within `config_poll_minutes` (5) and restarts what
  changed. Nothing connects *to* the machine, so no port is needed for it.

## Prerequisites

On your computer:

- Terraform 1.6+ or OpenTofu 1.6+.
- Docker, to build the images. They are built for `linux/amd64` (AWS, Google
  Cloud) or `linux/arm64` (Oracle Cloud's Ampere shapes). The first build of
  the toolchain image `tersect-base` is slow, and slowest when the platform
  is not your computer's: amd64 on an Apple Silicon Mac runs under emulation
  and can take an hour or more.
- **AWS:** the AWS CLI v2 with credentials that may manage EC2, VPC, IAM, ECR,
  Secrets Manager, Data Lifecycle Manager (and Route 53 for a record), plus
  the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
  to get a shell.
- **Google Cloud:** the gcloud CLI, a project with billing, and
  `gcloud auth application-default login`. You need rights to manage Compute
  Engine, IAM and service accounts, Secret Manager, Artifact Registry and
  Service Usage (Owner, or Editor plus Project IAM Admin and Secret Manager
  Admin).

Decide before you start:

- **A domain or not.** With a domain, browsers accept the certificate. Without
  one, every visitor has to click through a certificate warning; fine for a
  trial, awkward for colleagues.
- **Who may connect** (`allowed_cidrs`).
- **Where the state lives.** Copy `backend.tf.example` to `backend.tf` in the
  environment and fill it in (an S3 bucket with locking, or a Cloud Storage
  bucket). Without it the state is a local file, `terraform.tfstate`, with the
  passwords in it; `.gitignore` keeps it out of git, but it is still on your
  disk.

## First deployment: AWS

```sh
cd deploy/terraform/environments/aws
cp terraform.tfvars.example terraform.tfvars      # edit: region, image_tag, domain, allowed_cidrs
cp backend.tf.example backend.tf                  # optional but recommended; edit the bucket
terraform init
terraform apply
```

The apply takes a few minutes and ends with the outputs. The machine is now
up but has no images to run yet; it will keep trying every 5 minutes.

Build and push the images, with the tag you set as `image_tag`:

```sh
cd ../../../..                                    # repository root
deploy/scripts/push-images.sh \
  "$(terraform -chdir=deploy/terraform/environments/aws output -raw registry)" 1.0.0
```

Then:

1. **DNS.** With `route53_zone_id` the record exists already. With DNS
   elsewhere, create an `A` record for your domain pointing at the
   `public_ip` output. The certificate is requested once the name resolves;
   the proxy retries by itself.
2. **Wait** for the machine to pull the images (the first pull is several GB;
   allow 10 minutes after the push). To watch:

   ```sh
   $(terraform output -raw connect_command)       # a shell on the machine
   sudo journalctl -fu tersect -u tersect-sync
   sudo docker compose --project-directory /opt/tersect ps
   ```

3. **Open** the `url` output and log in with `terraform output username` and
   `terraform output -raw password`.

## First deployment: Google Cloud

```sh
cd deploy/terraform/environments/gcp
cp terraform.tfvars.example terraform.tfvars      # edit: project_id, region, zone, image_tag, ...
cp backend.tf.example backend.tf                  # optional but recommended; edit the bucket
terraform init
terraform apply
```

If the first apply stops with an error that an API "has not been used in
project ... before or it is disabled", wait a minute and apply again: newly
enabled APIs take a moment to become usable.

Build and push the images:

```sh
cd ../../../..
deploy/scripts/push-images.sh \
  "$(terraform -chdir=deploy/terraform/environments/gcp output -raw registry)" 1.0.0
```

Then the same three steps as on AWS: DNS (`dns_managed_zone` creates the
record; otherwise point your domain at `public_ip`), wait, open the `url`.
`connect_command` opens a shell through Identity-Aware Proxy.

## First deployment: Oracle Cloud (Always Free)

**Not yet applied to a real tenancy**: the configuration validates and passes
its mocked test. Treat the first apply as the test.

The defaults use the whole Always Free allowance: one Ampere A1 machine
(arm64) with 4 OCPUs and 24 GB, a 50 GB system disk and a 150 GB data volume.
Oracle's limits change; check them, and the notes in
[modules/oci-vm/README.md](modules/oci-vm/README.md), before relying on them.

Before you start:

- An Oracle Cloud account, and an **API signing key** for your user in
  `~/.oci/config` (console: Profile menu, My profile, API keys, Add API key;
  it shows the lines to put in the file). Your user must be a tenancy
  administrator: the deployment creates a dynamic group and a policy.
- An **auth token** for your user (same page, Auth tokens), to push images.
- The tenancy OCID (Profile menu, Tenancy) and your home region.

```sh
cd deploy/terraform/environments/oci
cp terraform.tfvars.example terraform.tfvars      # edit: tenancy_ocid, region, image_tag, ...
cp backend.tf.example backend.tf                  # optional but recommended
terraform init
terraform apply
```

If the apply stops with **"Out of host capacity"**, Oracle has no free A1
machines in that availability domain at the moment. Set `availability_domain`
to another one of the region if it has several, or apply again later; what
was created so far is kept.

Build and push the images **for arm64**. On an Apple Silicon Mac this is the
computer's own platform, so the toolchain image builds without emulation:

```sh
cd ../../../..
$(terraform -chdir=deploy/terraform/environments/oci output -raw registry_login)   # edit the user name; the password is the auth token
deploy/scripts/push-images.sh --platform linux/arm64 \
  "$(terraform -chdir=deploy/terraform/environments/oci output -raw registry)" 1.0.0
```

Then the same three steps as on AWS: DNS (point your domain's `A` record at
`public_ip`; no record is created for you), wait, open the `url`.

What differs from the other two clouds:

- **Shell access is SSH**, and closed unless you set `ssh_public_key` and
  `ssh_allowed_cidrs`; `connect_command` then prints the command. Changing
  the key replaces the machine.
- **The configuration bundle is an object in a private bucket**, not a
  secret, and the login password is only in the Terraform state
  (`terraform output -raw password`).
- **A changed boot script replaces the machine** (data volume and address
  stay), as on AWS.
- **No dataset assistant**: there is no GPU in the allowance.
- **Backups** are daily incremental volume backups, kept 4 days by default
  because five are free. To restore, set `data_volume_backup_id` and
  `terraform apply -replace=module.vm.oci_core_volume.data`.
- **Idle machines can be reclaimed** by Oracle on an Always Free account;
  upgrading the account to Pay As You Go lifts that and stays free inside the
  allowance.
- **If the site does not answer although the stack is up**, check the
  machine's own firewall: Oracle's Ubuntu images ship iptables rules that
  reject most incoming traffic. Docker normally places its rules in front of
  them; `sudo iptables -L FORWARD -n --line-numbers` shows whether it did.

### Deploying on every push

Instead of a new `image_tag` per release, the machine can follow a moving tag
that CI pushes. `.github/workflows/deploy-images.yml` does the pushing: on
every push to `develop` it builds the three images for arm64 and pushes them
to the GitHub Container Registry as `ghcr.io/<owner>/tersect-web:develop`,
`-backend:develop` and `-pipeline:develop`. It has **not run yet**; it starts
with the first push to `develop` that contains it.

1. Let the workflow run once (merge to `develop`, or start it from the
   Actions tab). The first run builds the toolchain image and takes long;
   later runs reuse it.
2. Make the four packages it created public (`tersect-web`,
   `tersect-backend`, `tersect-pipeline` and `tersect-base`): on GitHub, the
   organisation's Packages, the package, Package settings, Change visibility.
   The machine pulls without a login, so private packages fail with "pull
   access denied".
3. In `terraform.tfvars`, set `follow_images = true` and `images` to the three
   references (the example file has the lines), and apply.

From then on a push to `develop` is live a few minutes after its workflow
finishes: at every poll the machine pulls the tags it runs and restarts the
containers whose image changed. A running dataset build is interrupted when
the builder image changed. To go back, set `images` to the tags of an earlier
commit (`develop-<short sha>`, pushed alongside) and apply.

Changes under `deploy/terraform` are not deployed this way; they still need
`terraform apply`.

## Day to day

### Releasing a new version

```sh
deploy/scripts/push-images.sh <registry> 1.1.0
# set image_tag = "1.1.0" in terraform.tfvars
terraform apply
```

The apply changes one thing: the bundle secret. Within 5 minutes the machine
pulls the new images and recreates the containers whose image changed
(seconds of interruption; a running dataset build is interrupted if the
builder image changed). **The machine is not replaced and the data disk is
not touched.** To not wait, run `sudo systemctl start tersect-sync` on the
machine.

Always use a new tag. Pushing different images under a tag that is already
deployed changes nothing on the machine, because the configuration did not
change.

### What each change does

| You change | What happens | Interruption |
|---|---|---|
| `image_tag` | Bundle updated; machine pulls and recreates changed containers | seconds |
| `basic_auth_password`, `basic_auth_username` | Bundle updated; the proxy is restarted (with `public_site`: the builder, and everyone signed in is signed out) | seconds |
| `public_site` | Bundle updated; proxy and builder restarted | seconds |
| `allowed_cidrs` | Firewall changes at once; the proxy's own list follows within 5 minutes | seconds |
| `domain_name`, `acme_email` | Bundle updated; proxy and backend recreated; firewall rule for port 80 | seconds, plus the time to get a certificate |
| `assistant_model` | Bundle updated; the new model is downloaded | none for the site |
| `clickhouse_low_memory` | Bundle updated; takes effect when ClickHouse restarts: `sudo docker compose --project-directory /opt/tersect restart clickhouse` | seconds |
| instance or machine type, `enable_assistant` | The same machine is stopped and started with the new type | a few minutes (the first start with a GPU installs the driver: 10 to 20 minutes) |
| data disk size (larger) | Disk grows in place; the file system grows at the next boot, or at once with `sudo resize2fs "$(findmnt -no SOURCE /data)"` | none |
| the modules themselves (a `git pull` that changes the boot scripts) | **AWS:** the instance is replaced; data volume and IP are moved to the new one. **Google Cloud:** updated in place, effective at the next reboot | AWS: 5 to 10 minutes |

`terraform plan` shows which of these it is before anything happens. If the
plan says the *data volume* or *data disk* will be destroyed or replaced and
you did not ask for a restore, stop.

### Getting a shell, logs, status

```sh
$(terraform output -raw connect_command)

sudo systemctl status tersect tersect-sync.timer
sudo journalctl -u tersect -u tersect-sync --since today
cd /opt/tersect && sudo docker compose ps && sudo docker compose logs --tail 100 backend
sudo cat /var/log/cloud-init-output.log            # AWS: the first boot
sudo journalctl -u google-startup-scripts          # Google Cloud: every boot
```

Files in `/opt/tersect` are overwritten from the bundle; change settings in
`terraform.tfvars`, not there.

### The server folder

`/data/shared` on the machine is what the app offers as "server folder" when
adding a dataset. Copy large input files there (for example with
`aws s3 cp` or `gcloud storage cp` on the machine, after giving the machine's
role read access to your bucket: see the `instance_role_name` and
`service_account_email` outputs of the modules).

## The dataset assistant

`enable_assistant = true` switches the machine to a GPU type (AWS
`g5.xlarge`: one A10G, 24 GB; Google Cloud `n1-standard-8` with one T4,
16 GB), installs the NVIDIA driver and container toolkit at start, runs the
`ollama` service of the compose file, and downloads `assistant_model`
(`qwen3:14b`, about 9 GB) to the data disk.

- **Cost:** a GPU machine running all month is in the order of **$600 to $900
  a month**, against roughly $150 to $200 without it. Switching it on only
  while datasets are being added (it is one variable and an apply; the model
  stays on the data disk) is a reasonable way to use it.
- GPU types are not offered in every zone, and new accounts and projects often
  have a GPU quota of zero. On AWS set `availability_zone` if the default zone
  has no `g5`; ask for quota ("Running On-Demand G and VT instances" on AWS;
  `GPUS_ALL_REGIONS` and the regional T4 quota on Google Cloud).
- The driver installation is the least exercised part of this setup. If the
  assistant does not answer, look at `sudo journalctl -u tersect` and
  `nvidia-smi` on the machine.

## Sizing

The defaults are for a small deployment: 4 vCPU and 16 GB (`m6i.xlarge`,
`e2-standard-4`), a 60 GB system disk and a 200 GB data disk. ClickHouse runs
with the small-host settings of `clickhouse/low-memory.xml`.

With **32 GB or more** (`m6i.2xlarge`, `e2-standard-8`), set
`clickhouse_low_memory = false` so ClickHouse uses its own defaults (larger
caches, its telemetry tables). The data disk can be enlarged at any time and
never shrunk.

## Backups and restore

The data disk is snapshotted once a day (`snapshot_time_utc`, 03:00 UTC) and
`snapshot_retention_days` (14) snapshots are kept. The snapshots are taken
while the stack runs. MongoDB and ClickHouse recover from such a snapshot the
way they recover from a power cut; a dataset build that was running at that
moment is lost and has to be started again.

Everything that matters is on that disk: datasets, uploads, both databases,
the TLS certificate, the model. The system disk holds nothing that is not
rebuilt at boot.

**A snapshot by hand** (before a risky change):

```sh
aws ec2 create-snapshot --volume-id "$(terraform output -raw data_volume_id)" --description "before upgrade"
gcloud compute snapshots create tersect-before-upgrade --source-disk "$(terraform output -raw data_disk_name)" --source-disk-zone <zone>
```

**Restore.** This replaces the current data disk with a new one made from the
snapshot. The current disk is deleted, so snapshot it first if it holds
anything you might want.

AWS:

```sh
aws ec2 describe-snapshots --owner-ids self \
  --filters Name=tag:tersect:deployment,Values=tersect \
  --query 'sort_by(Snapshots,&StartTime)[].[SnapshotId,StartTime]' --output table
# set data_volume_snapshot_id = "snap-..." in terraform.tfvars
terraform apply -replace=module.vm.aws_ebs_volume.data
```

Google Cloud:

```sh
gcloud compute snapshots list --filter="labels.tersect-deployment=tersect" --sort-by=creationTimestamp
# set data_disk_snapshot = "<snapshot name>" in terraform.tfvars
terraform apply -replace=module.vm.google_compute_disk.data
```

In both cases the machine is replaced along with the disk and comes back with
the restored data, on the same address. The snapshot variable is only read
when the disk is created, so leaving it in `terraform.tfvars` afterwards, or
removing it, changes nothing.

Restored databases keep the passwords they were created with. Within one
deployment those are the passwords still in the state, so nothing needs doing.
Restoring a snapshot into a *different* deployment (a fresh state) does not
work as it is: the new deployment generates new passwords, which the restored
databases do not know.

### Protecting the data from `terraform destroy`

Terraform cannot switch `prevent_destroy` with a variable. To make a destroy
(or an accidental replacement) of the data disk fail, uncomment
`prevent_destroy = true` in the `lifecycle` block of the data volume:
`aws_ebs_volume.data` in `modules/aws-vm/compute.tf`, or
`google_compute_disk.data` in `modules/gcp-vm/compute.tf`. Comment it out
again for a restore or a real teardown.

## Costs to expect

Rough on-demand prices for a machine running all month, without data transfer
out. Prices differ by region and change; check the provider's calculator.

| | AWS | Google Cloud |
|---|---|---|
| Machine, 4 vCPU / 16 GB | `m6i.xlarge`: about $140 to $165 | `e2-standard-4`: about $100 to $125 |
| Data disk, 200 GB | gp3: about $16 to $20 | pd-balanced: about $20 to $25 |
| System disk, 60 GB | about $5 | about $6 |
| Public IPv4 address | about $4 | about $4 |
| Snapshots (incremental; depends on how much changes) | $0.05 per GB a month | about $0.05 per GB a month |
| Secrets, registry storage | a few dollars | a few dollars |
| **Total without the assistant** | **roughly $170 to $200 a month** | **roughly $135 to $165 a month** |
| With the assistant instead | `g5.xlarge`: about $730 to $900 for the machine | `n1-standard-8` + T4: about $530 to $650 for the machine |

A one- or three-year commitment (Savings Plan, committed use discount) takes
30 to 60% off the machine. Stopping the machine when nobody uses it stops the
machine cost only; disks, snapshots and the address keep costing.

## Destroying

```sh
terraform destroy
```

This deletes the machine **and the data disk with every dataset on it**.

- The daily snapshots are **not** deleted (on both clouds) and keep costing
  until you delete them. That is deliberate: they are the way back from a
  destroy you regret. Remove them by hand when you are sure
  (`aws ec2 describe-snapshots --owner-ids self --filters Name=tag:tersect:deployment,Values=<name>`,
  `gcloud compute snapshots list --filter="labels.tersect-deployment=<name>"`).
- AWS: the ECR repositories are only deleted when empty. Set
  `registry_force_delete = true` and apply before destroying, or delete the
  images first.
- To keep the data disk and remove everything else, take it out of the state
  first: `terraform state rm module.vm.aws_ebs_volume.data` (and
  `module.vm.aws_volume_attachment.data`), or
  `terraform state rm module.vm.google_compute_disk.data`. The disk then stays
  in your account, unmanaged.
- The state bucket of `backend.tf` was made by hand and stays.

## Checking the configuration without an account

Each environment has a test that runs the whole configuration against a mocked
provider. It needs no credentials and creates nothing (Terraform or OpenTofu
1.7+):

```sh
cd deploy/terraform/environments/aws && terraform init -backend=false && terraform test
```

The same works in `environments/gcp` and `environments/oci`.

## Troubleshooting

- **The site does not answer after the first apply.** The images have to be
  pushed first, then the machine needs up to 5 minutes to notice and several
  more to pull. `sudo journalctl -u tersect -u tersect-sync` on the machine
  says where it is.
- **"pull access denied" or "manifest unknown" in that log.** The tag in
  `image_tag` is not in the registry: compare with what `push-images.sh`
  printed.
- **Certificate errors with a domain.** The name must resolve to `public_ip`
  and port 80 must be reachable from the internet (it is, unless a network
  outside this setup blocks it). `sudo docker compose --project-directory /opt/tersect logs web`
  shows the certificate authority's answers. Let's Encrypt limits repeated
  failures; fix DNS before retrying many times.
- **Browser warning without a domain.** Expected: the certificate is
  self-signed.
- **"403/404 for everything" from a network that should be allowed.** Your
  address is not in `allowed_cidrs`; check what the site sees with
  `curl ifconfig.me`.
- **AWS: `connect_command` fails with "TargetNotConnected".** The machine
  registers with Systems Manager a minute or two after it starts.
- **Lock files.** `.terraform.lock.hcl` is not committed here, because
  Terraform and OpenTofu record different registries in it. For a long-lived
  deployment, keep the lock file your tool writes alongside your
  `terraform.tfvars`.
