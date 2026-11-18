# Deploying Tersect Browser

This guide takes you from a checkout of the repository to a running, password
protected Tersect Browser on **AWS** or **Google Cloud**. Follow it top to
bottom the first time. The reference for every setting, and for day-to-day
operation, is [terraform/README.md](terraform/README.md).

| Target | Status |
|---|---|
| A single machine with Docker (your own server, or a trial on a laptop) | Tested: the stack below ran and built a dataset end to end. |
| AWS | Ready to try. The Terraform validates and passes its tests, but **has not yet been applied to a real account**. |
| Google Cloud | Ready to try, with the same caveat. |
| HPC (Slurm + Apptainer) | Written, and exercised against a simulated cluster only: it has **never run on real Slurm or real Apptainer**. Not covered by this guide; see [hpc/README.md](hpc/README.md), starting with its "Before the first run" checklist. |

Because the cloud modules have not met a real account yet, treat your first
deployment as the test: do the trial in [Part 3](#part-3-a-trial-deployment)
before you put real data on it, and expect to report or fix a rough edge.

## Contents

1. [What gets deployed](#part-1-what-gets-deployed)
2. [Before you start](#part-2-before-you-start)
3. [A trial deployment](#part-3-a-trial-deployment)
4. [Deploying to AWS](#part-4-deploying-to-aws)
5. [Deploying to Google Cloud](#part-5-deploying-to-google-cloud)
6. [After the deployment is up](#part-6-after-the-deployment-is-up)
7. [Running it](#part-7-running-it)
8. [The dataset assistant](#part-8-the-dataset-assistant)
9. [Taking it down](#part-9-taking-it-down)
10. [When something goes wrong](#part-10-when-something-goes-wrong)

---

## Part 1: What gets deployed

One virtual machine runs five containers from
[compose/docker-compose.yml](compose/docker-compose.yml):

| Container | What it does |
|---|---|
| `web` | The only one reachable from outside. Caddy serves the app, handles HTTPS, asks for the password, enforces the IP allowlist and routes requests to the two below. |
| `backend` | The browser's API: distances, trees, variant search, introgression scans. |
| `builder` | Uploads, dataset builds (Snakemake, bcftools, snpEff, Tersect) and the assistant endpoint. |
| `database` | MongoDB: dataset records, views, drafts, build history. |
| `clickhouse` | Variant and gene tables for search. |

Everything worth keeping is on a **separate, encrypted data disk** mounted at
`/data` with a daily snapshot. The machine itself holds nothing that is not
rebuilt at boot, so it can be replaced without losing data.

It is one machine on purpose: the backend and the builder share dataset files
on one disk. There is no load balancer and no failover. A build, the databases
and the site share the machine's CPU and memory.

**Access.** The app has no user accounts. Anyone who gets past the shared
password can start builds, delete datasets and see every draft. The deployment
therefore always sets a password, and lets you restrict which networks may
connect at all. Give the password only to people you would give delete rights
to.

---

## Part 2: Before you start

### Tools on your computer

| Tool | Why | Check |
|---|---|---|
| Docker | Builds the three images. | `docker info` |
| Terraform 1.6+ **or** OpenTofu 1.6+ | Creates the cloud resources. The commands below say `terraform`; `tofu` takes the same arguments. | `terraform version` or `tofu version` |
| git | The image tag defaults to the git version. | `git describe --tags --always` |
| AWS only: AWS CLI v2 and the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) | Credentials, registry login, a shell on the machine. | `aws sts get-caller-identity` |
| Google Cloud only: gcloud CLI | The same. | `gcloud auth list` |

On macOS with Homebrew: `brew install opentofu awscli` and
`brew install --cask session-manager-plugin google-cloud-sdk`.

### The images take time the first time

The backend image is built on `tersect-base`, a large image with the analysis
toolchain (Julia, R, PhyloNet), for `linux/amd64` only. If you have run
`./start_all.sh` on this computer, it already exists. If not, the first build
takes a long time, and on an Apple Silicon Mac it runs under emulation and can
take an hour or more. Plan for it; later releases reuse it.

### Decisions to make now

1. **A domain name, or not.**
   With a domain (`tersect.your-institute.org`) the site gets a real
   certificate automatically. Without one it is served on its IP address with
   a self-signed certificate, and every visitor has to click through a browser
   warning. Use no domain for the trial and a domain for real use. You need to
   be able to create a DNS record for the domain.

2. **Who may connect.**
   `allowed_cidrs` is a list of network ranges. The default is everyone, which
   leaves the password as the only protection. If your users are on a campus
   or company network, find its public ranges (ask IT, or open
   [ifconfig.me](https://ifconfig.me) from that network) and list them.

3. **Size.**
   The default is 4 vCPU, 16 GB of memory and a 200 GB data disk: enough for
   panels of tens of accessions. Per-accession VCFs, the reference and the
   build's working files all live on the data disk; all-sites VCFs of large
   genomes need far more. The disk can be enlarged later, never shrunk.

4. **The assistant.**
   Off by default. Turning it on switches to a GPU machine that costs several
   times as much ([Part 8](#part-8-the-dataset-assistant)). Deploy without it
   first.

5. **Where Terraform keeps its state.**
   The state file contains every generated password in clear text. For
   anything beyond a trial, keep it in a private bucket
   ([step 2 of each cloud part](#part-4-deploying-to-aws)), not on a laptop.

### What it costs

Rough on-demand figures for a machine running all month, from memory rather
than a current price list; check your provider's calculator.

| | AWS | Google Cloud |
|---|---|---|
| Default size, no assistant | about $170 to $200 a month | about $135 to $165 a month |
| With the assistant (GPU) | about $750 to $950 a month | about $550 to $700 a month |

Disks, snapshots and the IP address keep costing while a machine is stopped.

---

## Part 3: A trial deployment

Two trials, in this order. The first costs nothing and takes minutes.

### 3a. The production stack on your own computer

This runs the same images and the same proxy as the cloud machine, so it
checks the images before you pay for anything. It needs about 3 GB of memory
free for Docker; stop the development stack first (`docker compose stop` in
the repository root) if memory is tight.

```sh
# From the repository root. Build the three images.
deploy/scripts/push-images.sh --build-only local/tersect trial

# Assemble a deployment folder outside the repository.
mkdir -p ~/tersect-trial/{site.d,clickhouse,data}
cp deploy/compose/docker-compose.yml deploy/compose/mongo-init.js ~/tersect-trial/
cp clickhouse/schema.sql clickhouse/users.sh clickhouse/low-memory.xml ~/tersect-trial/clickhouse/

# A password for the proxy (prints a hash; choose your own password).
HASH=$(docker run --rm caddy:2.10-alpine caddy hash-password --plaintext 'choose-a-password')
printf 'basic_auth {\n\ttersect %s\n}\n' "$HASH" > ~/tersect-trial/site.d/auth.caddy

# Settings. Passwords: letters and digits only.
cat > ~/tersect-trial/.env <<EOF
TB_IMAGE_WEB=local/tersect/web:trial
TB_IMAGE_BACKEND=local/tersect/backend:trial
TB_IMAGE_PIPELINE=local/tersect/pipeline:trial
TB_SITE_ADDRESS=:80
TB_PUBLIC_URL=http://localhost:8088
TB_TLS_DIRECTIVE=
TB_HTTP_PORT=8088
TB_HTTPS_PORT=8443
TB_DATA_DIR=$HOME/tersect-trial/data
TB_DB_NAME=tersect_browser_gp
TB_MONGO_USER=tersect
TB_MONGO_PASSWORD=trialapp123
MONGO_ROOT_PASSWORD=trialroot123
CLICKHOUSE_ADMIN_PASSWORD=trialadmin123
CLICKHOUSE_READER_PASSWORD=trialreader123
TB_ASSISTANT_URL=
COMPOSE_PROFILES=
EOF

cd ~/tersect-trial && docker compose -p tersect-trial up -d
```

Open <http://localhost:8088>. You should be asked for a user name (`tersect`)
and the password you chose, then see the home page with an empty dataset
list. Add a small dataset through **New dataset** to see a build run; the
Arabidopsis example in
[the prompt skill](../.claude/skills/tersect-dataset-prompt/SKILL.md) builds
in a few minutes.

Remove it with `docker compose -p tersect-trial down` and delete
`~/tersect-trial`.

This is also how to run Tersect Browser on **a server of your own** without
any cloud: use real passwords, set `TB_SITE_ADDRESS` to your domain,
`TB_PUBLIC_URL` to `https://your-domain`, leave the two ports at 80 and 443,
and point `TB_DATA_DIR` at a disk with room.

### 3b. A throwaway cloud deployment

Do [Part 4](#part-4-deploying-to-aws) or [Part 5](#part-5-deploying-to-google-cloud)
once with **no domain** and the default size, check that the site comes up
and builds the small dataset, then destroy it ([Part 9](#part-9-taking-it-down)).
A day of the default machine costs a few dollars. This is the first real test
of the Terraform, so keep notes of anything that does not match this guide.

---

## Part 4: Deploying to AWS

Allow about an hour, most of it waiting, plus the image build.

### Step 1: Credentials

Use an identity that may manage EC2, VPC, IAM roles, ECR, Secrets Manager and
Data Lifecycle Manager (and Route 53 if it holds your domain). An
administrator role is simplest for a first deployment.

```sh
aws configure sso          # or: aws configure
export AWS_PROFILE=your-profile
aws sts get-caller-identity
```

The last command must print your account number. Choose a region close to
your users, for example `eu-west-2`.

### Step 2: A bucket for the state (recommended)

Skip this for a throwaway trial; the state is then a local file,
`terraform.tfstate`, that you must not lose or share.

```sh
BUCKET=your-org-tersect-tfstate      # must be globally unique
REGION=eu-west-2
aws s3api create-bucket --bucket $BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-bucket-versioning --bucket $BUCKET \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

cd deploy/terraform/environments/aws
cp backend.tf.example backend.tf     # edit: bucket and region
```

`backend.tf.example` explains the locking option for older Terraform versions.

### Step 3: Settings

```sh
cd deploy/terraform/environments/aws
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`. For a trial, these three lines are enough:

```hcl
region    = "eu-west-2"
name      = "tersect"
image_tag = "1.0.0"
```

For real use, also set:

```hcl
domain_name     = "tersect.your-institute.org"
acme_email      = "you@your-institute.org"      # the certificate authority's contact
route53_zone_id = "Z0123456789ABCDEFGHIJ"       # only if Route 53 hosts the domain
allowed_cidrs   = ["203.0.113.0/24"]            # your networks
```

Leave `basic_auth_password` out: a password is generated and you read it
after the apply, which keeps it out of files. `terraform.tfvars` is ignored by
git.

### Step 4: Create the resources

```sh
terraform init
terraform plan        # read it: only resources to add, none to change or destroy
terraform apply       # type "yes"
```

This takes a few minutes and ends with outputs, including `url`,
`public_ip`, `registry` and `connect_command`. The machine is running but
idle: its images do not exist yet. It checks every 5 minutes.

### Step 5: Build and push the images

From the repository root, with the same tag as `image_tag`:

```sh
cd ../../../..
deploy/scripts/push-images.sh \
  "$(terraform -chdir=deploy/terraform/environments/aws output -raw registry)" 1.0.0
```

The script logs in to ECR with your AWS credentials, builds for `linux/amd64`
and pushes `web`, `backend` and `pipeline`. The backend image is several GB;
the first push depends on your upload speed.

### Step 6: DNS (only with a domain)

- With `route53_zone_id`, the record already exists.
- Otherwise create an `A` record for your domain pointing at the `public_ip`
  output, at your DNS provider.

The certificate is requested as soon as the name resolves; the proxy keeps
trying by itself.

### Step 7: Watch it come up

After the push, the machine needs up to 5 minutes to notice and several more
to pull the images. To watch:

```sh
cd deploy/terraform/environments/aws
$(terraform output -raw connect_command)           # a shell; no SSH port is open
sudo journalctl -fu tersect -u tersect-sync        # Ctrl-C to stop following
sudo docker compose --project-directory /opt/tersect ps
```

`connect_command` can answer "TargetNotConnected" for the first minute or two
after the machine starts. When `docker compose ps` lists five services as
running (two of them "healthy"), the site is up.

### Step 8: Log in

```sh
terraform output url
terraform output username
terraform output -raw password; echo
```

Open the URL and log in. Without a domain, accept the browser's certificate
warning. Continue with [Part 6](#part-6-after-the-deployment-is-up).

---

## Part 5: Deploying to Google Cloud

Allow about an hour, most of it waiting, plus the image build.

### Step 1: Project and credentials

You need a project with billing enabled and the rights to manage Compute
Engine, IAM and service accounts, Secret Manager, Artifact Registry and
Service Usage (Owner is simplest for a first deployment).

```sh
gcloud auth login
gcloud auth application-default login     # what Terraform uses
gcloud config set project your-project-id
gcloud projects describe your-project-id --format='value(projectNumber)'
```

The last command must print a number. Choose a region and a zone close to
your users, for example `europe-west2` and `europe-west2-b`.

### Step 2: A bucket for the state (recommended)

Skip this for a throwaway trial.

```sh
gcloud storage buckets create gs://your-org-tersect-tfstate \
  --project your-project-id --location europe-west2 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://your-org-tersect-tfstate --versioning

cd deploy/terraform/environments/gcp
cp backend.tf.example backend.tf          # edit: bucket
```

### Step 3: Settings

```sh
cd deploy/terraform/environments/gcp
cp terraform.tfvars.example terraform.tfvars
```

For a trial:

```hcl
project_id = "your-project-id"
region     = "europe-west2"
zone       = "europe-west2-b"
name       = "tersect"
image_tag  = "1.0.0"
```

For real use, also set:

```hcl
domain_name      = "tersect.your-institute.org"
acme_email       = "you@your-institute.org"
dns_managed_zone = "your-zone-name"        # only if Cloud DNS hosts the domain
allowed_cidrs    = ["203.0.113.0/24"]      # your networks
```

### Step 4: Create the resources

```sh
terraform init
terraform plan
terraform apply
```

Terraform enables the APIs it needs. If the first apply stops with an error
that an API "has not been used in project ... before or it is disabled", wait
a minute and run `terraform apply` again: newly enabled APIs take a moment.

### Step 5: Build and push the images

```sh
cd ../../../..
deploy/scripts/push-images.sh \
  "$(terraform -chdir=deploy/terraform/environments/gcp output -raw registry)" 1.0.0
```

The script logs in to Artifact Registry with your gcloud login.

### Step 6: DNS (only with a domain)

With `dns_managed_zone` the record exists. Otherwise point an `A` record for
your domain at the `public_ip` output.

### Step 7: Watch it come up

```sh
cd deploy/terraform/environments/gcp
$(terraform output -raw connect_command)           # SSH through Identity-Aware Proxy
sudo journalctl -fu tersect -u tersect-sync
sudo docker compose --project-directory /opt/tersect ps
sudo journalctl -u google-startup-scripts          # the boot script's own log
```

### Step 8: Log in

```sh
terraform output url
terraform output username
terraform output -raw password; echo
```

---

## Part 6: After the deployment is up

### Check it works

1. The home page shows an empty dataset list with **New dataset** and
   **Builds**.
2. **A first dataset.** Click **New dataset** and add a small public panel.
   The Arabidopsis example in
   [the prompt skill](../.claude/skills/tersect-dataset-prompt/SKILL.md)
   gives the reference and VCF locations; enter them in the wizard by URL
   (the assistant is off unless you enabled it). The build should finish in a
   few minutes and the dataset should open in the browser.
3. **From outside your allowlist** (a phone on mobile data), the site should
   refuse the connection or answer 403 or 404, with the right password too.

### Share the login

Send colleagues the URL, the user name and the password through a channel you
trust. Operators who cannot read the Terraform state can read the password
from the secret store with the command in `terraform output password_command`.

To change the password, set `basic_auth_password` (or remove it to generate a
new one) and `terraform apply`; the proxy restarts within 5 minutes.

### Large input files: the server folder

Uploading tens of GB through a browser is slow. `/data/shared` on the machine
appears in the wizard as **Server folder**: copy files there and pick them
without uploading.

```sh
$(terraform output -raw connect_command)
sudo mkdir -p /data/shared/my-panel
# AWS, from a bucket the machine's role may read:
sudo aws s3 cp s3://your-bucket/panel/ /data/shared/my-panel/ --recursive
# Google Cloud:
sudo gcloud storage cp -r gs://your-bucket/panel/* /data/shared/my-panel/
```

The machine's role can read only its own secret and registry. To let it read
a bucket of yours, grant read access to the role or service account named in
the `aws-vm` / `gcp-vm` module outputs (`instance_role_name`,
`service_account_email`).

Public data is simpler: give the wizard the URLs and the build downloads them.

---

## Part 7: Running it

The reference, [terraform/README.md](terraform/README.md), has the full
detail. The essentials:

### Release a new version

```sh
deploy/scripts/push-images.sh <registry> 1.1.0      # a NEW tag every time
# set image_tag = "1.1.0" in terraform.tfvars
terraform apply
```

The machine is not replaced. Within 5 minutes it pulls the new images and
recreates the containers that changed: seconds of interruption. A dataset
build that is running when the builder image changes is interrupted and
re-queued. Pushing new images under a tag that is already deployed changes
nothing.

### Read a plan before you apply it

`terraform plan` says what will happen. Changing the tag, the password, the
allowlist or the domain only updates the configuration. Changing the machine
type stops and starts the same machine. **If a plan says the data volume or
data disk will be destroyed or replaced and you did not ask for a restore,
stop.**

### Backups

The data disk is snapshotted every day at 03:00 UTC and 14 snapshots are kept
(`snapshot_retention_days`). Take one by hand before a risky change:

```sh
# AWS
aws ec2 create-snapshot --volume-id "$(terraform output -raw data_volume_id)" \
  --description "before upgrade"
# Google Cloud
gcloud compute snapshots create tersect-before-upgrade \
  --source-disk "$(terraform output -raw data_disk_name)" --source-disk-zone <zone>
```

Restoring replaces the data disk with one made from a snapshot; the steps are
under "Backups and restore" in the reference. A restore has not been
rehearsed yet: **rehearse one on your trial deployment before you rely on it.**

### Logs and status

```sh
$(terraform output -raw connect_command)
sudo systemctl status tersect tersect-sync.timer
cd /opt/tersect && sudo docker compose ps
sudo docker compose logs --tail 100 builder      # or backend, web, clickhouse, database
```

Files in `/opt/tersect` are overwritten from Terraform's configuration; change
settings in `terraform.tfvars`, not on the machine.

### More memory

With 32 GB or more (`m6i.2xlarge`, `e2-standard-8`), set
`clickhouse_low_memory = false`. Change `instance_type` / `machine_type` and
apply; the machine restarts with the new size.

### A fuller disk

Raise `data_volume_size_gb` / `data_disk_size_gb` and apply. The disk grows in
place; the file system grows at the next boot, or at once with
`sudo resize2fs "$(findmnt -no SOURCE /data)"` on the machine.

---

## Part 8: The dataset assistant

The assistant reads papers and folder listings and proposes the wizard's
values, on a model that runs on your machine: nothing is sent to an outside
model service. It needs a GPU.

```hcl
enable_assistant = true
# AWS:           assistant_instance_type = "g5.xlarge"
# Google Cloud:  assistant_machine_type  = "n1-standard-8", gpu_type = "nvidia-tesla-t4"
# assistant_model = "qwen3:14b"
```

`terraform apply` stops the machine, changes it to the GPU type and starts it.
The first start installs the NVIDIA driver and downloads the model (about
9 GB): allow 20 to 30 minutes before the **Assistant** button appears in the
wizard.

Before you turn it on:

- **Quota.** New accounts and projects often have a GPU quota of zero. AWS:
  request "Running On-Demand G and VT instances". Google Cloud: request
  `GPUS_ALL_REGIONS` and the T4 quota of your region. Approval can take a day.
- **Availability.** GPU types are not in every zone. On AWS set
  `availability_zone` if the default has no `g5`.
- **Cost.** Several times the default machine (Part 2). Because the model
  stays on the data disk, a reasonable pattern is to turn the assistant on
  while datasets are being added and off again afterwards.
- **This is the least tested part.** The driver installation has never run on
  a cloud machine. If the assistant does not answer, check
  `sudo journalctl -u tersect` and `nvidia-smi` on the machine.

Writing good prompts for the assistant is covered by
[the prompt skill](../.claude/skills/tersect-dataset-prompt/SKILL.md).

---

## Part 9: Taking it down

```sh
terraform destroy
```

This deletes the machine **and the data disk with every dataset on it**.

- **Snapshots stay** and keep costing until you delete them. That is
  deliberate: they are the way back from a destroy you regret. List them with
  `aws ec2 describe-snapshots --owner-ids self --filters Name=tag:tersect:deployment,Values=<name>`
  or `gcloud compute snapshots list --filter="labels.tersect-deployment=<name>"`.
- **AWS:** the ECR repositories are only deleted when empty. Set
  `registry_force_delete = true` and apply before destroying, or delete the
  images first.
- **To keep the data disk** and remove everything else, see "Destroying" in
  the reference.
- The state bucket was made by hand and stays; delete it yourself when you no
  longer need the history.

To make an accidental destroy of the data fail, see "Protecting the data from
terraform destroy" in the reference.

---

## Part 10: When something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The site does not answer after the first apply | The images are not pushed yet, or the machine is still pulling them | Push the images (step 5). Then wait: up to 5 minutes to notice, several more to pull. `sudo journalctl -u tersect -u tersect-sync` shows where it is. |
| "pull access denied" or "manifest unknown" in that log | `image_tag` is not in the registry | Compare the tag with what `push-images.sh` printed; push it or correct the variable. |
| Browser certificate warning | No domain: the certificate is self-signed | Expected for a trial. Set `domain_name` for real use. |
| Certificate errors with a domain | The name does not resolve to `public_ip` yet, or port 80 is blocked outside this setup | Check `dig +short your-domain`. `sudo docker compose --project-directory /opt/tersect logs web` shows the certificate authority's answers. Fix DNS before retrying many times: Let's Encrypt limits repeated failures. |
| 403 or 404 for everything, from a network that should be allowed | Your address is not in `allowed_cidrs` | `curl ifconfig.me` shows the address the site sees. |
| Password refused | Wrong user name, or the password was changed | `terraform output username`, `terraform output -raw password`. |
| AWS: `connect_command` says "TargetNotConnected" | The machine registers a minute or two after starting | Wait and retry. Check the Session Manager plugin is installed. |
| Google Cloud: the first apply fails on an API "not used before or disabled" | Newly enabled APIs take a moment | Run `terraform apply` again. |
| A build fails with a memory error in "Loading search tables" | ClickHouse ran out of memory | Retry the build (finished steps are kept). If it repeats, use a larger machine. |
| A build fails in "Checking accessions" with "No variants left" | The VCF's chromosome names differ from the reference's | **Fix and retry** on the build page opens the rename map. |
| The disk is full | Uploads, downloads and build work files accumulate | Enlarge the data disk (Part 7). |

If a step in this guide does not match what you see, the cause may be the
Terraform rather than you: it has not yet run against a real account. The
boot script's log (`/var/log/cloud-init-output.log` on AWS,
`sudo journalctl -u google-startup-scripts` on Google Cloud) is the first
place to look.

---

## What is in this folder

```
deploy/
  README.md            this guide
  compose/             the production stack: compose file, settings template, access control snippets
  docker/              the production web image (Caddy + the built app) and its Caddyfile
  scripts/             push-images.sh: build and push the three images
  terraform/           modules and environments (reference: terraform/README.md)
  hpc/                 Slurm + Apptainer runtime and its own guide (untested on a real cluster)
```
