variable "project_id" {
  description = "Google Cloud project to deploy into."
  type        = string
}

variable "region" {
  description = "Region to deploy into (for example europe-west2)."
  type        = string
}

variable "zone" {
  description = "Zone of the machine, inside region (for example europe-west2-b). With the assistant, pick one that offers the GPU type."
  type        = string
}

variable "labels" {
  description = "Labels added to every resource, on top of application and managed-by."
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

variable "machine_type" {
  description = "Machine type without the assistant (x86_64). The default has 4 vCPU and 16 GB."
  type        = string
  default     = "e2-standard-4"
}

variable "assistant_machine_type" {
  description = "Machine type with the assistant. The default has 8 vCPU and 30 GB; one GPU of gpu_type is attached to it."
  type        = string
  default     = "n1-standard-8"
}

variable "gpu_type" {
  description = "GPU attached with the assistant. The default T4 has 16 GB."
  type        = string
  default     = "nvidia-tesla-t4"
}

variable "data_disk_size_gb" {
  description = "Size of the data disk. It can be enlarged later, never shrunk."
  type        = number
  default     = 200
}

variable "data_disk_snapshot" {
  description = "Snapshot to create the data disk from. Only read when the disk is created (see the README, Restore)."
  type        = string
  default     = null
}

# --- Network -----------------------------------------------------------------

variable "subnetwork" {
  description = "Self link of an existing subnetwork to use. Leave null to create a network."
  type        = string
  default     = null
}

variable "dns_managed_zone" {
  description = "Name of the Cloud DNS managed zone in which to create the record for domain_name. Leave null when DNS is managed elsewhere."
  type        = string
  default     = null
}

variable "enable_apis" {
  description = "Enable the Google Cloud APIs the deployment needs."
  type        = bool
  default     = true
}
