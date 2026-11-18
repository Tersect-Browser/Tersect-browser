variable "tenancy_ocid" {
  description = "OCID of the tenancy (Profile menu, Tenancy, in the console)."
  type        = string
}

variable "compartment_ocid" {
  description = "OCID of the compartment to deploy into. Leave null to use the tenancy's root compartment."
  type        = string
  default     = null
}

variable "region" {
  description = "Region to deploy into (for example uk-london-1). Always Free resources exist only in the tenancy's home region."
  type        = string
}

variable "home_region" {
  description = "Home region of the tenancy, when it is not region. Dynamic groups and policies are created there."
  type        = string
  default     = null
}

variable "config_file_profile" {
  description = "Profile of ~/.oci/config to take the credentials from."
  type        = string
  default     = "DEFAULT"
}

variable "availability_domain" {
  description = "Availability domain of the machine. Leave null to use the first one of the region."
  type        = string
  default     = null
}

variable "tags" {
  description = "Free-form tags added to every resource, on top of application and managed-by."
  type        = map(string)
  default     = {}
}

variable "name" {
  description = "Name of the deployment: the prefix of every resource. Use a different name (and a different state) for each deployment."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

# --- Release -----------------------------------------------------------------

variable "image_tag" {
  description = "Tag of the three application images in this deployment's registry, as pushed by deploy/scripts/push-images.sh. Change it and apply to roll out a release. Not needed when images is set."
  type        = string
  default     = null

  validation {
    condition     = var.image_tag == null || can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "image_tag must be a valid image tag: letters, digits, underscore, dot and hyphen."
  }

  validation {
    condition     = var.image_tag != null || var.images != null
    error_message = "Set image_tag (images in this deployment's registry) or images (full references elsewhere)."
  }
}

variable "images" {
  description = "Full image references, to use images from another registry that needs no login. When set, no registry is created and image_tag is ignored."
  type = object({
    web      = string
    backend  = string
    pipeline = string
  })
  default = null
}

variable "follow_images" {
  description = "Follow a moving image tag: every few minutes the machine looks for newer images under the tags it runs and restarts what changed. Set it together with images (or image_tag) naming the tag that CI pushes, for example \"develop\"."
  type        = bool
  default     = false
}

# --- Address and access ------------------------------------------------------

variable "domain_name" {
  description = "Domain to serve the site on (for example tersect.example.org), with an automatic certificate. Point its A record at the public_ip output. Leave null to serve on the IP address with a self-signed certificate (browsers will warn)."
  type        = string
  default     = null
}

variable "acme_email" {
  description = "Contact address given to the certificate authority for expiry notices. Only used with domain_name."
  type        = string
  default     = null
}

variable "allowed_cidrs" {
  description = "Networks allowed to use the site, in CIDR notation. The default allows the whole internet; the shared password is then the only protection."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.allowed_cidrs) > 0 && alltrue([for cidr in var.allowed_cidrs : can(cidrhost(cidr, 0)) && !strcontains(cidr, ":")])
    error_message = "allowed_cidrs must be a non-empty list of IPv4 CIDR blocks such as 203.0.113.0/24 or 198.51.100.7/32."
  }
}

variable "public_site" {
  description = "Let anyone browse the datasets without a password. The login is then asked only for adding, changing and deleting datasets."
  type        = bool
  default     = false
}

variable "basic_auth_username" {
  description = "User name of the shared login."
  type        = string
  default     = "tersect"
}

variable "basic_auth_password" {
  description = "Password of the shared login (12 to 72 characters). Leave null to generate one."
  type        = string
  default     = null
  sensitive   = true
}

variable "ssh_public_key" {
  description = "An SSH public key for the ubuntu user (one line, as in ~/.ssh/id_ed25519.pub). Leave null for no SSH login."
  type        = string
  default     = null
}

variable "ssh_allowed_cidrs" {
  description = "Networks allowed to reach port 22, for example your own address as 198.51.100.7/32. Empty leaves SSH closed."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.ssh_allowed_cidrs) == 0 || var.ssh_public_key != null
    error_message = "ssh_allowed_cidrs needs ssh_public_key: without a key there is nothing to log in with."
  }
}

# --- Machine -----------------------------------------------------------------

variable "shape" {
  description = "Shape of the machine. The default is the Ampere (arm64) shape of the Always Free allowance."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "Number of OCPUs. Always Free covers 4."
  type        = number
  default     = 4
}

variable "memory_gb" {
  description = "Memory in GB. Always Free covers 24."
  type        = number
  default     = 24
}

variable "image_id" {
  description = "OCID of the boot image. Leave null for the current Ubuntu 24.04 LTS image of the shape."
  type        = string
  default     = null
}

variable "boot_volume_size_gb" {
  description = "Size of the system disk. Always Free covers 200 GB of block storage in all: this plus data_volume_size_gb."
  type        = number
  default     = 50
}

variable "data_volume_size_gb" {
  description = "Size of the data volume. It can be enlarged later, never shrunk."
  type        = number
  default     = 150
}

variable "data_volume_backup_id" {
  description = "Volume backup to create the data volume from. Only read when the volume is created (see the README, Restore)."
  type        = string
  default     = null
}

# --- Backups and tuning -------------------------------------------------------

variable "enable_backups" {
  description = "Take a daily backup of the data volume."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "How many days of daily backups to keep. Always Free covers five volume backups in all."
  type        = number
  default     = 4
}

variable "clickhouse_low_memory" {
  description = "Apply the small-host ClickHouse settings. Set to false on a machine with 32 GB of memory or more."
  type        = bool
  default     = true
}

# --- Network -----------------------------------------------------------------

variable "subnet_id" {
  description = "OCID of an existing public subnet to use. Leave null to create a VCN."
  type        = string
  default     = null
}
