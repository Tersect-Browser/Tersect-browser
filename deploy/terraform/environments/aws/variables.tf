variable "region" {
  description = "AWS region to deploy into (for example eu-west-2)."
  type        = string
}

variable "tags" {
  description = "Tags added to every resource, on top of Application and ManagedBy."
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
  description = "Tag of the three application images, as pushed by deploy/scripts/push-images.sh. Change it and apply to roll out a release."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "image_tag must be a valid image tag: letters, digits, underscore, dot and hyphen."
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

# --- Address and access ------------------------------------------------------

variable "domain_name" {
  description = "Domain to serve the site on (for example tersect.example.org), with an automatic certificate. Leave null to serve on the IP address with a self-signed certificate (browsers will warn)."
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

# --- Assistant ---------------------------------------------------------------

variable "enable_assistant" {
  description = "Run the dataset assistant with a local model. Switches to a GPU machine, which costs several times more."
  type        = bool
  default     = false
}

variable "assistant_model" {
  description = "Ollama model of the assistant, downloaded on the machine at start."
  type        = string
  default     = "qwen3:14b"
}

# --- Backups and tuning -------------------------------------------------------

variable "enable_snapshots" {
  description = "Take a daily snapshot of the data disk."
  type        = bool
  default     = true
}

variable "snapshot_retention_days" {
  description = "How many days of daily snapshots to keep."
  type        = number
  default     = 14
}

variable "clickhouse_low_memory" {
  description = "Apply the small-host ClickHouse settings. Set to false on a machine with 32 GB of memory or more."
  type        = bool
  default     = true
}

# --- Machine -----------------------------------------------------------------

variable "instance_type" {
  description = "Instance type without the assistant (x86_64). The default has 4 vCPU and 16 GB."
  type        = string
  default     = "m6i.xlarge"
}

variable "assistant_instance_type" {
  description = "Instance type with the assistant (x86_64 with an NVIDIA GPU). The default has 4 vCPU, 16 GB and one A10G with 24 GB."
  type        = string
  default     = "g5.xlarge"
}

variable "data_volume_size_gb" {
  description = "Size of the data volume. It can be enlarged later, never shrunk."
  type        = number
  default     = 200
}

variable "data_volume_snapshot_id" {
  description = "Snapshot to create the data volume from. Only read when the volume is created (see the README, Restore)."
  type        = string
  default     = null
}

# --- Network -----------------------------------------------------------------

variable "subnet_id" {
  description = "An existing public subnet to use. Leave null to create a small VPC."
  type        = string
  default     = null
}

variable "availability_zone" {
  description = "Availability zone of the created subnet. Leave null for the first one of the region."
  type        = string
  default     = null
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone in which to create the record for domain_name. Leave null when DNS is managed elsewhere."
  type        = string
  default     = null
}

variable "registry_force_delete" {
  description = "Let destroy delete the image repositories even when they hold images."
  type        = bool
  default     = false
}
