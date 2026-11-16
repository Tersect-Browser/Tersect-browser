# gcp-vm

One Compute Engine instance (Ubuntu 24.04 LTS) that runs the Tersect Browser
compose stack, and everything around it.

## What it creates

| File | Resources |
|---|---|
| `main.tf` | Enables the APIs it uses (Compute Engine, Secret Manager, Artifact Registry, IAM, IAP, and Cloud DNS when a record is asked for). |
| `network.tf` | A network with one subnetwork (skipped with `subnetwork`). Firewall rules on the deployment's network tag: 443 from `allowed_cidrs`; 80 from everywhere with a domain (certificate validation and redirect), otherwise from `allowed_cidrs`; 22 from Google's Identity-Aware Proxy range only. |
| `iam.tf` | A service account that can pull from this deployment's repository, read the bundle secret, and write logs and metrics. |
| `registry.tf` | An Artifact Registry Docker repository named after the deployment, deleting versions older than 30 days except the 10 most recent. |
| `secrets.tf` | Secret Manager: `<name>-config-bundle` (read by the instance) and `<name>-basic-auth-password` (for operators). |
| `compute.tf` | The instance (shielded VM, OS Login, project SSH keys blocked), a persistent data disk, a static external address, an optional Cloud DNS record. With the assistant: an N1 machine with one T4. |
| `backup.tf` | A snapshot schedule attached to the data disk: one snapshot a day, kept `snapshot_retention_days` days, and kept when the disk is deleted. |

## Behaviour to know

- **Configuration changes do not touch the instance.** The bundle is a secret;
  the instance polls it. Changing an image tag, the password or the allowlist
  updates the secret (and the firewall), nothing else.
- **A changed boot script is updated in place** and runs at the next boot
  (Compute Engine runs the startup script at every boot; it is idempotent).
  Reboot to apply it:
  `gcloud compute instances reset <name> --zone <zone>`.
- **Changing the machine type** (including `enable_assistant`) stops and
  starts the same instance.
- **A newer Ubuntu image never replaces the instance.** To move to a new image
  on purpose: `terraform apply -replace=module.vm.google_compute_instance.this`.
- **`data_disk_snapshot` is only read when the disk is created.** To restore,
  replace the disk on purpose (the instance is replaced with it); see the main
  README.
- **Protecting the data disk from `destroy`:** `prevent_destroy` cannot be
  driven by a variable. Uncomment the line in the `lifecycle` block of
  `google_compute_disk.data` in `compute.tf`.
- Disks are encrypted at rest with Google-managed keys. Customer-managed keys
  are not wired in.
- To log in, a person needs `roles/iap.tunnelResourceAccessor` and
  `roles/compute.osAdminLogin` (project owners have both).
- The GPU needs quota (`GPUS_ALL_REGIONS` and the regional T4 quota), and the
  zone must offer the GPU type.

## Example

```hcl
module "vm" {
  source = "../../modules/gcp-vm"

  name       = "tersect"
  project_id = "my-project"
  region     = "europe-west2"
  zone       = "europe-west2-b"

  bundle              = module.config.bundle
  basic_auth_password = module.config.basic_auth_password
  allowed_cidrs       = ["203.0.113.0/24"]
  domain_name         = "tersect.example.org"
  dns_managed_zone    = "example-org"
}
```

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"tersect"` | Prefix of every resource name, and the value of the tersect-deployment label. Use a different name for each deployment in one project. |
| `labels` | `map(string)` | `{}` | Labels added to every resource that takes labels (lowercase keys and values). |
| `project_id` | `string` | **required** | Google Cloud project to deploy into. |
| `region` | `string` | **required** | Region of the address, the subnet, the image repository and the snapshots. |
| `zone` | `string` | **required** | Zone of the instance and its data disk, inside region. With the assistant, pick a zone that offers the GPU type. |
| `enable_apis` | `bool` | `true` | Enable the Google Cloud APIs the deployment uses. Set to false when someone else manages the project's APIs. |
| `bundle` | `string` | **required** | The configuration bundle (output of the stack-config module). Stored in Secret Manager; the instance fetches it with its service account. *(sensitive)* |
| `basic_auth_password` | `string` | **required** | Password of the shared login, stored in a second secret for the people who operate the deployment. The instance cannot read it. *(sensitive)* |
| `subnetwork` | `string` | `null` | Self link or id of an existing subnetwork in region to place the instance in. Leave null to create a network with one subnetwork. |
| `subnet_cidr` | `string` | `"10.42.0.0/24"` | Address range of the subnetwork that is created when subnetwork is null. |
| `allowed_cidrs` | `list(string)` | `["0.0.0.0/0"]` | IPv4 networks allowed to reach the site on port 443. The default allows everyone. |
| `enable_iap_ssh` | `bool` | `true` | Allow SSH from Google's Identity-Aware Proxy range only (gcloud compute ssh --tunnel-through-iap). Port 22 is never open to the internet. |
| `domain_name` | `string` | `null` | Domain the site is served on, or null. With a domain, port 80 is open to the world (the certificate authority checks the domain there, and it redirects to HTTPS). |
| `dns_managed_zone` | `string` | `null` | Name of the Cloud DNS managed zone (in this project) in which to create the A record for domain_name. Leave null when DNS is managed elsewhere, and point the domain at the public_ip output yourself. |
| `machine_type` | `string` | `"e2-standard-4"` | Machine type without the assistant. Must be x86_64 (the backend image is linux/amd64 only). |
| `enable_assistant` | `bool` | `false` | Use assistant_machine_type with a GPU, for the dataset assistant's model. Set the same value in the stack-config module. |
| `assistant_machine_type` | `string` | `"n1-standard-8"` | Machine type with the assistant. Must be a type GPUs can be attached to (N1), or a type with a built-in GPU (G2; then set gpu_count to 0). |
| `gpu_type` | `string` | `"nvidia-tesla-t4"` | GPU attached with the assistant. |
| `gpu_count` | `number` | `1` | Number of GPUs attached with the assistant. 0 for machine types that include their GPU. |
| `boot_image` | `string` | `"ubuntu-os-cloud/ubuntu-2404-lts-amd64"` | Boot image, as project/family or a full image path. The image of a running instance is never changed by a later apply. |
| `boot_disk_size_gb` | `number` | `60` | Size of the system disk, which also holds the container images (and the NVIDIA driver with the assistant). |
| `enable_secure_boot` | `bool` | `true` | Shielded VM secure boot. Ubuntu's packaged NVIDIA driver is signed and loads with it; switch it off only if you install an unsigned kernel module. |
| `config_poll_minutes` | `number` | `5` | How often the instance checks Secret Manager for a changed configuration. |
| `data_disk_size_gb` | `number` | `200` | Size of the data disk (datasets, databases, certificates, model files). It can be enlarged later, never shrunk. |
| `data_disk_type` | `string` | `"pd-balanced"` | Persistent disk type of the data disk. |
| `data_disk_snapshot` | `string` | `null` | Name or self link of a snapshot to create the data disk from (restoring a backup). Only read when the disk is created; see the README for the restore procedure. |
| `enable_snapshots` | `bool` | `true` | Take a daily snapshot of the data disk (a snapshot schedule). |
| `snapshot_retention_days` | `number` | `14` | How many days snapshots are kept. |
| `snapshot_time_utc` | `string` | `"03:00"` | Start of the daily snapshot window, in UTC, on the hour (HH:00). |
| `create_registry` | `bool` | `true` | Create an Artifact Registry Docker repository named after the deployment. Set to false when the images live in a registry that needs no login. |
| `registry_keep_images` | `number` | `10` | How many recent versions of each image the repository always keeps; other versions are deleted once they are 30 days old. |

## Outputs

| Name | Description |
|---|---|
| `public_ip` | The static address of the deployment. It stays the same when the instance is replaced. |
| `instance_name` | Name of the Compute Engine instance. |
| `connect_command` | Opens a shell on the instance through Identity-Aware Proxy (needs roles/iap.tunnelResourceAccessor and roles/compute.osAdminLogin). |
| `registry` | Registry prefix for deploy/scripts/push-images.sh (the images are <registry>/web, /backend and /pipeline), or null when create_registry is false. |
| `data_disk_name` | Name of the data disk. |
| `bundle_secret_id` | Id of the secret that holds the configuration bundle. |
| `password_secret_id` | Id of the secret that holds the login password. |
| `password_command` | Prints the login password. |
| `service_account_email` | Email of the instance's service account, to grant it further access (for example read access to a bucket of input files). |
| `network_tag` | Network tag the firewall rules apply to. |
| `bootstrap_script_sha256` | Hash of the boot script. A change takes effect at the next boot of the instance. |
