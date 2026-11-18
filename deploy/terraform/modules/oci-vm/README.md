# oci-vm

One Oracle Cloud compute instance (Ubuntu 24.04 LTS) that runs the Tersect
Browser compose stack, and everything around it. The defaults are the whole
Always Free allowance: an Ampere A1 (arm64) instance with 4 OCPUs and 24 GB,
and 200 GB of block storage.

**Not yet applied to a real tenancy.** The configuration validates against
the provider and passes its mocked test; the first real apply is the test.

## What it creates

| File | Resources |
|---|---|
| `network.tf` | A VCN with one public subnet, an internet gateway and a route table (skipped with `subnet_id`). A network security group on the instance: 443 from `allowed_cidrs`; 80 from everywhere with a domain (certificate validation and redirect), otherwise from `allowed_cidrs`; 22 from `ssh_allowed_cidrs` only (closed by default). The created subnet gets a security list without rules, so nothing else is open. |
| `iam.tf` | A dynamic group that matches the instance, and a policy that lets it read the configuration bucket and pull from the compartment's repositories. |
| `registry.tf` | Private Container Registry repositories `<name>/web`, `<name>/backend` and `<name>/pipeline`. |
| `config.tf` | A private Object Storage bucket `<name>-config` with the configuration bundle as `bundle.json`. |
| `compute.tf` | The instance, a block volume for the data (paravirtualized, at `/dev/oracleoci/oraclevdb`), a reserved public address. |
| `backup.tf` | A backup policy on the data volume: one incremental backup a day, kept `backup_retention_days` days. |

## Providers

The module needs two configurations of the `oci` provider: the default one for
the region of the deployment, and `oci.home` for the tenancy's home region,
where Oracle Cloud keeps dynamic groups and policies. In an Always Free
tenancy both are the same region.

```hcl
module "vm" {
  source = "../../modules/oci-vm"

  providers = {
    oci      = oci
    oci.home = oci.home
  }

  name         = "tersect"
  tenancy_ocid = "ocid1.tenancy.oc1..aaaa..."
  region       = "uk-london-1"

  bundle        = module.config.bundle
  allowed_cidrs = ["203.0.113.0/24"]
  domain_name   = "tersect.example.org"
}
```

## Behaviour to know

- **The images must be arm64** for the default shape:
  `deploy/scripts/push-images.sh --platform linux/arm64 …`.
- **Configuration changes do not touch the instance.** The bundle is an
  object in a bucket; the instance polls it. Changing an image tag, the
  password or the allowlist updates the object (and the security group),
  nothing else.
- **The first start takes a few minutes longer than on the other clouds.**
  The address, the bundle and the policy can only be made after the instance
  (each needs something of it), so the first attempts of the machine to fetch
  its configuration fail and its timer retries.
- **A changed boot script or SSH key replaces the instance.** Oracle Cloud
  reads both once, at creation. The data volume and the address stay.
- **A newer Ubuntu image never replaces the instance.** To move to a new image
  on purpose: `terraform apply -replace=module.vm.oci_core_instance.this`.
- **`data_volume_backup_id` is only read when the volume is created.** To
  restore, replace the volume on purpose (the instance is replaced with it).
- **Protecting the data volume from `destroy`:** uncomment `prevent_destroy`
  in the `lifecycle` block of `oci_core_volume.data` in `compute.tf`.
- **The login password is only in the Terraform state** (`terraform output
  -raw password`); unlike the AWS and Google Cloud modules, this one keeps no
  second copy in a secret store.
- **The bundle is in Object Storage, not in a Vault secret**, because a
  secret holds 25 KB and the bundle is larger. The bucket is private and
  encrypted at rest with Oracle-managed keys; the instance is the only
  principal the module gives read access to.
- **Containers cannot reach the instance's identity.** The boot hooks add a
  firewall rule that keeps containers away from the metadata service.
- **Creating the dynamic group and the policy needs tenancy administrator
  rights**, also when everything else goes into a compartment.
- **No DNS record and no GPU.** Point your domain at `public_ip` yourself; the
  dataset assistant's local model is not offered here.

## Always Free: what to check

These are Oracle's limits as understood when this was written. They change;
check the current list before relying on them.

- 4 OCPUs and 24 GB of Ampere A1 in all, in the home region only.
- 200 GB of block storage in all (boot volume plus data volume: 50 + 150 by
  default) and five volume backups.
- Free capacity for A1 is often exhausted in popular regions: the apply then
  fails with "Out of host capacity". Try another `availability_domain`, or
  again later.
- Oracle may reclaim an Always Free instance it considers idle (low CPU,
  network and memory use over seven days). Upgrading the account to Pay As You
  Go lifts that; resources inside the allowance stay free.
- Registry storage counts against the Object Storage allowance (20 GB).

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"tersect"` | Prefix of every resource name, and the value of the tersect-deployment tag. |
| `tags` | `map(string)` | `{}` | Free-form tags added to every resource that takes tags. |
| `tenancy_ocid` | `string` | **required** | OCID of the tenancy. The instance's dynamic group is created in it. |
| `compartment_ocid` | `string` | `null` | Compartment to deploy into. Null uses the root compartment. |
| `region` | `string` | **required** | Region of the deployment. Always Free resources exist only in the home region. |
| `availability_domain` | `string` | `null` | Availability domain of the instance and its data volume. Null uses the first one of the region. |
| `bundle` | `string` | **required** | The configuration bundle (output of the stack-config module). *(sensitive)* |
| `subnet_id` | `string` | `null` | An existing public subnet to place the instance in. Null creates a VCN with one subnet. |
| `vcn_cidr` | `string` | `"10.42.0.0/16"` | Address range of the VCN that is created. |
| `subnet_cidr` | `string` | `"10.42.0.0/24"` | Address range of the subnet that is created. |
| `allowed_cidrs` | `list(string)` | `["0.0.0.0/0"]` | IPv4 networks allowed to reach the site on port 443. |
| `domain_name` | `string` | `null` | Domain the site is served on, or null. With a domain, port 80 is open to the world. |
| `ssh_public_key` | `string` | `null` | An SSH public key for the ubuntu user. Changing it replaces the instance. |
| `ssh_allowed_cidrs` | `list(string)` | `[]` | IPv4 networks allowed to reach port 22. Empty leaves SSH closed. |
| `shape` | `string` | `"VM.Standard.A1.Flex"` | Shape of the instance. |
| `ocpus` | `number` | `4` | Number of OCPUs, for a flexible shape. |
| `memory_gb` | `number` | `24` | Memory in GB, for a flexible shape. |
| `image_id` | `string` | `null` | Boot image. Null uses the current Ubuntu 24.04 LTS image of the shape. |
| `boot_volume_size_gb` | `number` | `50` | Size of the system disk, which also holds the container images. |
| `follow_images` | `bool` | `false` | Also look, at every poll, for newer images under the tags the stack already runs, and restart what changed. Changing it replaces the instance. |
| `config_poll_minutes` | `number` | `5` | How often the instance checks the bucket for a changed configuration. |
| `data_volume_size_gb` | `number` | `150` | Size of the data volume. It can be enlarged later, never shrunk. |
| `data_volume_vpus_per_gb` | `number` | `10` | Performance level of the data volume: 0, 10 or 20. |
| `data_volume_backup_id` | `string` | `null` | A volume backup to create the data volume from. Only read at creation. |
| `enable_backups` | `bool` | `true` | Take a daily incremental backup of the data volume. |
| `backup_retention_days` | `number` | `4` | How many days backups are kept. |
| `backup_hour_utc` | `number` | `3` | Hour of the day, in UTC, at which the daily backup starts. |
| `create_registry` | `bool` | `true` | Create the repositories and let the instance pull from them. |

## Outputs

| Name | Description |
|---|---|
| `public_ip` | The reserved address of the deployment. |
| `instance_id` | OCID of the compute instance. |
| `connect_command` | Opens a shell on the instance, or says what is missing for one. |
| `registry` | Registry prefix for `push-images.sh`, or null when `create_registry` is false. |
| `registry_host` | Host to give to `docker login` before pushing. |
| `namespace` | Object Storage namespace of the tenancy. |
| `data_volume_id` | OCID of the data volume. |
| `bundle_bucket` | Name of the bucket that holds the configuration bundle. |
| `dynamic_group` | Name of the instance's dynamic group, to grant it further access. |
| `bootstrap_script_sha256` | Hash of the boot script. A change replaces the instance. |
