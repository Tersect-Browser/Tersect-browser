variable "name" {
  description = "Prefix of every resource name, and the value of the tersect-deployment tag. Use a different name for each deployment in one compartment."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "tags" {
  description = "Free-form tags added to every resource that takes tags."
  type        = map(string)
  default     = {}
}

variable "tenancy_ocid" {
  description = "OCID of the tenancy. The instance's dynamic group is created in it."
  type        = string

  validation {
    condition     = startswith(var.tenancy_ocid, "ocid1.tenancy.")
    error_message = "tenancy_ocid must be a tenancy OCID (ocid1.tenancy.oc1..…)."
  }
}

variable "compartment_ocid" {
  description = "OCID of the compartment to deploy into. Leave null to use the tenancy's root compartment."
  type        = string
  default     = null
}

variable "region" {
  description = "Region of the deployment (for example uk-london-1). Always Free resources exist only in the tenancy's home region."
  type        = string
}

variable "availability_domain" {
  description = "Availability domain of the instance and its data volume (for example Uocm:UK-LONDON-1-AD-1). Leave null to use the first one of the region. Try another when the region has several and one is out of capacity."
  type        = string
  default     = null
}

# --- Configuration from the stack-config module ------------------------------

variable "bundle" {
  description = "The configuration bundle (output of the stack-config module). Stored in a private bucket; the instance fetches it with its own identity."
  type        = string
  sensitive   = true
}

# --- Network -----------------------------------------------------------------

variable "subnet_id" {
  description = "OCID of an existing public subnet to place the instance in. Leave null to create a VCN with one subnet. Rules of the subnet's own security lists apply on top of this module's."
  type        = string
  default     = null
}

variable "vcn_cidr" {
  description = "Address range of the VCN that is created when subnet_id is null."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrhost(var.vcn_cidr, 0))
    error_message = "vcn_cidr must be a CIDR block such as 10.42.0.0/16."
  }
}

variable "subnet_cidr" {
  description = "Address range of the subnet that is created when subnet_id is null, inside vcn_cidr."
  type        = string
  default     = "10.42.0.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_cidr, 0))
    error_message = "subnet_cidr must be a CIDR block such as 10.42.0.0/24."
  }
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
  description = "Domain the site is served on, or null. With a domain, port 80 is open to the world (the certificate authority checks the domain there, and it redirects to HTTPS). Point the domain's A record at the public_ip output yourself."
  type        = string
  default     = null
}

variable "ssh_public_key" {
  description = "An SSH public key for the ubuntu user, or null for none. Read when the instance is created: changing it replaces the instance."
  type        = string
  default     = null

  validation {
    condition     = var.ssh_public_key == null || can(regex("^(ssh-|ecdsa-|sk-)", var.ssh_public_key))
    error_message = "ssh_public_key must be one line in OpenSSH format (ssh-ed25519 AAAA… or ssh-rsa AAAA…)."
  }
}

variable "ssh_allowed_cidrs" {
  description = "IPv4 networks allowed to reach port 22. Empty (the default) leaves SSH closed."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.ssh_allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "ssh_allowed_cidrs must be a list of IPv4 CIDR blocks."
  }

  validation {
    condition     = length(var.ssh_allowed_cidrs) == 0 || var.ssh_public_key != null
    error_message = "ssh_allowed_cidrs needs ssh_public_key: without a key there is nothing to log in with."
  }
}

# --- Instance ----------------------------------------------------------------

variable "shape" {
  description = "Shape of the instance. The default is the Ampere (arm64) shape of the Always Free allowance; the images must be built for the shape's architecture (push-images.sh --platform)."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "Number of OCPUs, for a flexible shape. Always Free covers 4 on VM.Standard.A1.Flex."
  type        = number
  default     = 4

  validation {
    condition     = var.ocpus >= 1
    error_message = "ocpus must be at least 1."
  }
}

variable "memory_gb" {
  description = "Memory in GB, for a flexible shape. Always Free covers 24 on VM.Standard.A1.Flex."
  type        = number
  default     = 24

  validation {
    condition     = var.memory_gb >= 8
    error_message = "memory_gb must be at least 8: ClickHouse, MongoDB and a build do not fit in less."
  }
}

variable "image_id" {
  description = "OCID of the boot image. Leave null for the current Ubuntu 24.04 LTS image of the shape. The image of a running instance is never changed by a later apply."
  type        = string
  default     = null
}

variable "boot_volume_size_gb" {
  description = "Size of the system disk, which also holds the container images. Always Free covers 200 GB of block storage in all: this plus data_volume_size_gb."
  type        = number
  default     = 50

  validation {
    condition     = var.boot_volume_size_gb >= 50
    error_message = "boot_volume_size_gb must be at least 50 (the smallest boot volume; the application images alone take about 15 GB)."
  }
}

variable "follow_images" {
  description = "Also look, at every poll, for newer images under the tags the stack already runs (a moving tag pushed by CI), and restart the containers whose image changed. Read at first boot: changing it replaces the instance."
  type        = bool
  default     = false
}

variable "config_poll_minutes" {
  description = "How often the instance checks the bucket for a changed configuration."
  type        = number
  default     = 5
}

# --- Data volume -------------------------------------------------------------

variable "data_volume_size_gb" {
  description = "Size of the data volume (datasets, databases, certificates). It can be enlarged later, never shrunk."
  type        = number
  default     = 150

  validation {
    condition     = var.data_volume_size_gb >= 50
    error_message = "data_volume_size_gb must be at least 50 (the smallest block volume)."
  }
}

variable "data_volume_vpus_per_gb" {
  description = "Performance level of the data volume: 0 lower cost, 10 balanced, 20 higher performance."
  type        = number
  default     = 10

  validation {
    condition     = contains([0, 10, 20], var.data_volume_vpus_per_gb)
    error_message = "data_volume_vpus_per_gb must be 0, 10 or 20."
  }
}

variable "data_volume_backup_id" {
  description = "OCID of a volume backup to create the data volume from (restoring a backup). Only read when the volume is created; see the README for the restore procedure."
  type        = string
  default     = null
}

# --- Backups -----------------------------------------------------------------

variable "enable_backups" {
  description = "Take a daily incremental backup of the data volume."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "How many days backups are kept. Always Free covers five volume backups in all, so 4 or fewer stays inside it."
  type        = number
  default     = 4

  validation {
    condition     = var.backup_retention_days >= 1 && floor(var.backup_retention_days) == var.backup_retention_days
    error_message = "backup_retention_days must be a whole number of at least 1."
  }
}

variable "backup_hour_utc" {
  description = "Hour of the day, in UTC, at which the daily backup starts (0 to 23)."
  type        = number
  default     = 3

  validation {
    condition     = var.backup_hour_utc >= 0 && var.backup_hour_utc <= 23 && floor(var.backup_hour_utc) == var.backup_hour_utc
    error_message = "backup_hour_utc must be a whole number from 0 to 23."
  }
}

# --- Registry ----------------------------------------------------------------

variable "create_registry" {
  description = "Create private Container Registry repositories named after the deployment and let the instance pull from them. Set to false when the images live in a registry that needs no login."
  type        = bool
  default     = true
}
