# aws-vm

One EC2 instance (Ubuntu 24.04 LTS) that runs the Tersect Browser compose
stack, and everything around it.

## What it creates

| File | Resources |
|---|---|
| `network.tf` | A VPC with one public subnet, internet gateway and route table (skipped with `subnet_id`). A security group: 443 from `allowed_cidrs`; 80 from everywhere with a domain (certificate validation and redirect), otherwise from `allowed_cidrs`; all outbound. **No SSH.** |
| `iam.tf` | Instance role and profile: `AmazonSSMManagedInstanceCore` (Session Manager), pull from this deployment's ECR repositories, read the bundle secret. |
| `registry.tf` | ECR repositories `<name>/web`, `<name>/backend`, `<name>/pipeline`, scanned on push, keeping the last 10 images. |
| `secrets.tf` | Secrets Manager: `<name>/config-bundle` (read by the instance) and `<name>/basic-auth-password` (for operators). |
| `compute.tf` | The instance (IMDSv2 required, encrypted gp3 root volume), an encrypted EBS data volume attached as `/dev/sdf`, an Elastic IP, an optional Route 53 record. |
| `backup.tf` | A Data Lifecycle Manager policy and its role: one snapshot of the data volume a day, `snapshot_retention_days` kept. |

## Behaviour to know

- **Configuration changes do not touch the instance.** The bundle is a secret;
  the instance polls it. Changing an image tag, the password or the allowlist
  updates the secret (and the security group), nothing else.
- **A changed boot script replaces the instance** (`user_data_replace_on_change`).
  That happens when this module's scripts change or `config_poll_minutes`
  changes. The data volume and the Elastic IP are separate resources and are
  attached to the new instance.
- **Changing the instance type** (including `enable_assistant`) stops and
  starts the same instance.
- **A newer Ubuntu image never replaces the instance** (`ignore_changes = [ami]`).
  To move to a new image on purpose:
  `terraform apply -replace=module.vm.aws_instance.this`.
- **`data_volume_snapshot_id` is only read when the volume is created.** To
  restore, replace the volume on purpose; see the main README.
- **Protecting the data volume from `destroy`:** `prevent_destroy` cannot be
  driven by a variable. Uncomment the line in the `lifecycle` block of
  `aws_ebs_volume.data` in `compute.tf`.
- With `kms_key_arn`, the key policy must let the account use the key for EBS
  and Secrets Manager; the instance role gets `kms:Decrypt` through Secrets
  Manager only.
- An existing subnet (`subnet_id`) must be public: the instance needs to
  reach package mirrors, Docker Hub and the AWS APIs, and be reachable on 443.

## Example

```hcl
module "vm" {
  source = "../../modules/aws-vm"

  name                = "tersect"
  bundle              = module.config.bundle
  basic_auth_password = module.config.basic_auth_password
  allowed_cidrs       = ["203.0.113.0/24"]
  domain_name         = "tersect.example.org"
  route53_zone_id     = "Z0123456789ABCDEFGHIJ"
}
```

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"tersect"` | Prefix of every resource name, and the value of the tersect:deployment tag. Use a different name for each deployment in one account and region. |
| `tags` | `map(string)` | `{}` | Tags added to every resource. |
| `bundle` | `string` | **required** | The configuration bundle (output of the stack-config module). Stored in Secrets Manager; the instance fetches it with its role. *(sensitive)* |
| `basic_auth_password` | `string` | **required** | Password of the shared login, stored in a second secret for the people who operate the deployment. The instance cannot read it. *(sensitive)* |
| `subnet_id` | `string` | `null` | An existing public subnet (one with a route to an internet gateway) to place the instance in. Leave null to create a small VPC with one public subnet. |
| `vpc_cidr` | `string` | `"10.42.0.0/24"` | Address range of the VPC that is created when subnet_id is null. |
| `availability_zone` | `string` | `null` | Availability zone of the created subnet. Leave null for the first zone of the region; set it when the instance type is not offered there (GPU types are not in every zone). Ignored with subnet_id. |
| `allowed_cidrs` | `list(string)` | `["0.0.0.0/0"]` | IPv4 networks allowed to reach the site on port 443. The default allows everyone. |
| `domain_name` | `string` | `null` | Domain the site is served on, or null. With a domain, port 80 is open to the world (the certificate authority checks the domain there, and it redirects to HTTPS). |
| `route53_zone_id` | `string` | `null` | Route 53 hosted zone in which to create the A record for domain_name. Leave null when DNS is managed elsewhere, and point the domain at the public_ip output yourself. |
| `instance_type` | `string` | `"m6i.xlarge"` | Instance type without the assistant. Must be x86_64 (the backend image is linux/amd64 only). |
| `enable_assistant` | `bool` | `false` | Use assistant_instance_type, a GPU instance, for the dataset assistant's model. Set the same value in the stack-config module. |
| `assistant_instance_type` | `string` | `"g5.xlarge"` | Instance type with the assistant: x86_64 with one NVIDIA GPU of 16 GB or more. |
| `ami_id` | `string` | `null` | Machine image. Leave null for the current Ubuntu Server 24.04 LTS image of the region. The image of a running instance is never changed by a later apply. |
| `root_volume_size_gb` | `number` | `60` | Size of the system disk, which also holds the container images (and the NVIDIA driver with the assistant). |
| `config_poll_minutes` | `number` | `5` | How often the instance checks Secrets Manager for a changed configuration. |
| `data_volume_size_gb` | `number` | `200` | Size of the data volume (datasets, databases, certificates, model files). It can be enlarged later, never shrunk. |
| `data_volume_type` | `string` | `"gp3"` | EBS volume type of the data volume. |
| `data_volume_snapshot_id` | `string` | `null` | Snapshot to create the data volume from (restoring a backup). Only read when the volume is created; see the README for the restore procedure. |
| `kms_key_arn` | `string` | `null` | Customer-managed KMS key for the volumes and the secrets. Leave null for the AWS-managed keys (aws/ebs, aws/secretsmanager). |
| `enable_snapshots` | `bool` | `true` | Take a daily snapshot of the data volume (Data Lifecycle Manager). |
| `snapshot_retention_days` | `number` | `14` | How many daily snapshots to keep. |
| `snapshot_time_utc` | `string` | `"03:00"` | Time of day of the snapshot, in UTC, as HH:MM. |
| `create_registry` | `bool` | `true` | Create the three ECR repositories (<name>/web, <name>/backend, <name>/pipeline). Set to false when the images live in a registry that needs no login. |
| `registry_force_delete` | `bool` | `false` | Let terraform destroy delete the repositories even when they still hold images. |
| `registry_keep_images` | `number` | `10` | How many images each repository keeps; older ones are expired. |
| `registry_immutable_tags` | `bool` | `false` | Refuse to overwrite an existing image tag. Safer, but push-images.sh then fails when a tag is pushed twice. |
| `secret_recovery_window_days` | `number` | `0` | Days Secrets Manager keeps a deleted secret before removing it (7 to 30), or 0 to delete at once. With a recovery window, a deployment of the same name cannot be created again until the window has passed. |

## Outputs

| Name | Description |
|---|---|
| `public_ip` | The Elastic IP of the deployment. It stays the same when the instance is replaced. |
| `instance_id` | Id of the EC2 instance. |
| `connect_command` | Opens a shell on the instance through Session Manager (needs the AWS CLI and its Session Manager plugin). |
| `registry` | Registry prefix for deploy/scripts/push-images.sh (the images are <registry>/web, /backend and /pipeline), or null when create_registry is false. |
| `repository_urls` | URL of each ECR repository, by image name (web, backend, pipeline). Empty when create_registry is false. |
| `data_volume_id` | Id of the data volume. |
| `bundle_secret_arn` | ARN of the secret that holds the configuration bundle. |
| `password_secret_arn` | ARN of the secret that holds the login password. |
| `password_command` | Prints the login password. |
| `security_group_id` | Id of the instance's security group. |
| `instance_role_name` | Name of the instance role, to attach further policies (for example read access to a bucket of input files). |
| `bootstrap_script_sha256` | Hash of the boot script. The instance is replaced when it changes. |
