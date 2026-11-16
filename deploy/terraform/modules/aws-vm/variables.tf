variable "name" {
  description = "Prefix of every resource name, and the value of the tersect:deployment tag. Use a different name for each deployment in one account and region."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "tags" {
  description = "Tags added to every resource."
  type        = map(string)
  default     = {}
}

# --- Configuration from the stack-config module ------------------------------

variable "bundle" {
  description = "The configuration bundle (output of the stack-config module). Stored in Secrets Manager; the instance fetches it with its role."
  type        = string
  sensitive   = true
}

variable "basic_auth_password" {
  description = "Password of the shared login, stored in a second secret for the people who operate the deployment. The instance cannot read it."
  type        = string
  sensitive   = true
}

# --- Network -----------------------------------------------------------------

variable "subnet_id" {
  description = "An existing public subnet (one with a route to an internet gateway) to place the instance in. Leave null to create a small VPC with one public subnet."
  type        = string
  default     = null

  validation {
    condition     = var.subnet_id == null || can(regex("^subnet-[0-9a-f]+$", var.subnet_id))
    error_message = "subnet_id must look like subnet-0123456789abcdef0."
  }
}

variable "vpc_cidr" {
  description = "Address range of the VPC that is created when subnet_id is null."
  type        = string
  default     = "10.42.0.0/24"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a CIDR block such as 10.42.0.0/24."
  }
}

variable "availability_zone" {
  description = "Availability zone of the created subnet. Leave null for the first zone of the region; set it when the instance type is not offered there (GPU types are not in every zone). Ignored with subnet_id."
  type        = string
  default     = null
}

variable "allowed_cidrs" {
  description = "IPv4 networks allowed to reach the site on port 443. The default allows everyone."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.allowed_cidrs) > 0 && alltrue([for cidr in var.allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "allowed_cidrs must be a non-empty list of IPv4 CIDR blocks."
  }
}

variable "domain_name" {
  description = "Domain the site is served on, or null. With a domain, port 80 is open to the world (the certificate authority checks the domain there, and it redirects to HTTPS)."
  type        = string
  default     = null
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone in which to create the A record for domain_name. Leave null when DNS is managed elsewhere, and point the domain at the public_ip output yourself."
  type        = string
  default     = null

  validation {
    condition     = var.route53_zone_id == null || var.domain_name != null
    error_message = "route53_zone_id needs domain_name."
  }
}

# --- Instance ----------------------------------------------------------------

variable "instance_type" {
  description = "Instance type without the assistant. Must be x86_64 (the backend image is linux/amd64 only)."
  type        = string
  default     = "m6i.xlarge"
}

variable "enable_assistant" {
  description = "Use assistant_instance_type, a GPU instance, for the dataset assistant's model. Set the same value in the stack-config module."
  type        = bool
  default     = false
}

variable "assistant_instance_type" {
  description = "Instance type with the assistant: x86_64 with one NVIDIA GPU of 16 GB or more."
  type        = string
  default     = "g5.xlarge"
}

variable "ami_id" {
  description = "Machine image. Leave null for the current Ubuntu Server 24.04 LTS image of the region. The image of a running instance is never changed by a later apply."
  type        = string
  default     = null

  validation {
    condition     = var.ami_id == null || can(regex("^ami-[0-9a-f]+$", var.ami_id))
    error_message = "ami_id must look like ami-0123456789abcdef0."
  }
}

variable "root_volume_size_gb" {
  description = "Size of the system disk, which also holds the container images (and the NVIDIA driver with the assistant)."
  type        = number
  default     = 60

  validation {
    condition     = var.root_volume_size_gb >= 30
    error_message = "root_volume_size_gb must be at least 30: the application images alone take about 15 GB."
  }
}

variable "config_poll_minutes" {
  description = "How often the instance checks Secrets Manager for a changed configuration."
  type        = number
  default     = 5
}

# --- Data volume -------------------------------------------------------------

variable "data_volume_size_gb" {
  description = "Size of the data volume (datasets, databases, certificates, model files). It can be enlarged later, never shrunk."
  type        = number
  default     = 200

  validation {
    condition     = var.data_volume_size_gb >= 20
    error_message = "data_volume_size_gb must be at least 20."
  }
}

variable "data_volume_type" {
  description = "EBS volume type of the data volume."
  type        = string
  default     = "gp3"

  validation {
    condition     = contains(["gp3", "gp2", "io1", "io2", "st1"], var.data_volume_type)
    error_message = "data_volume_type must be one of gp3, gp2, io1, io2, st1."
  }
}

variable "data_volume_snapshot_id" {
  description = "Snapshot to create the data volume from (restoring a backup). Only read when the volume is created; see the README for the restore procedure."
  type        = string
  default     = null

  validation {
    condition     = var.data_volume_snapshot_id == null || can(regex("^snap-[0-9a-f]+$", var.data_volume_snapshot_id))
    error_message = "data_volume_snapshot_id must look like snap-0123456789abcdef0."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key for the volumes and the secrets. Leave null for the AWS-managed keys (aws/ebs, aws/secretsmanager)."
  type        = string
  default     = null
}

# --- Backups -----------------------------------------------------------------

variable "enable_snapshots" {
  description = "Take a daily snapshot of the data volume (Data Lifecycle Manager)."
  type        = bool
  default     = true
}

variable "snapshot_retention_days" {
  description = "How many daily snapshots to keep."
  type        = number
  default     = 14

  validation {
    condition     = var.snapshot_retention_days >= 1 && var.snapshot_retention_days <= 1000 && floor(var.snapshot_retention_days) == var.snapshot_retention_days
    error_message = "snapshot_retention_days must be a whole number from 1 to 1000."
  }
}

variable "snapshot_time_utc" {
  description = "Time of day of the snapshot, in UTC, as HH:MM."
  type        = string
  default     = "03:00"

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):[0-5][0-9]$", var.snapshot_time_utc))
    error_message = "snapshot_time_utc must be HH:MM (24-hour clock)."
  }
}

# --- Registry and secrets ----------------------------------------------------

variable "create_registry" {
  description = "Create the three ECR repositories (<name>/web, <name>/backend, <name>/pipeline). Set to false when the images live in a registry that needs no login."
  type        = bool
  default     = true
}

variable "registry_force_delete" {
  description = "Let terraform destroy delete the repositories even when they still hold images."
  type        = bool
  default     = false
}

variable "registry_keep_images" {
  description = "How many images each repository keeps; older ones are expired."
  type        = number
  default     = 10

  validation {
    condition     = var.registry_keep_images >= 2
    error_message = "registry_keep_images must be at least 2 (the running release and the next one)."
  }
}

variable "registry_immutable_tags" {
  description = "Refuse to overwrite an existing image tag. Safer, but push-images.sh then fails when a tag is pushed twice."
  type        = bool
  default     = false
}

variable "secret_recovery_window_days" {
  description = "Days Secrets Manager keeps a deleted secret before removing it (7 to 30), or 0 to delete at once. With a recovery window, a deployment of the same name cannot be created again until the window has passed."
  type        = number
  default     = 0

  validation {
    condition     = var.secret_recovery_window_days == 0 || (var.secret_recovery_window_days >= 7 && var.secret_recovery_window_days <= 30)
    error_message = "secret_recovery_window_days must be 0 or from 7 to 30."
  }
}
