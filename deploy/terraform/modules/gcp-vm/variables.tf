variable "name" {
  description = "Prefix of every resource name, and the value of the tersect-deployment label. Use a different name for each deployment in one project."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "labels" {
  description = "Labels added to every resource that takes labels (lowercase keys and values)."
  type        = map(string)
  default     = {}
}

variable "project_id" {
  description = "Google Cloud project to deploy into."
  type        = string
}

variable "region" {
  description = "Region of the address, the subnet, the image repository and the snapshots."
  type        = string
}

variable "zone" {
  description = "Zone of the instance and its data disk, inside region. With the assistant, pick a zone that offers the GPU type."
  type        = string

  validation {
    condition     = startswith(var.zone, "${var.region}-")
    error_message = "zone must be a zone of region (for example europe-west2-b in europe-west2)."
  }
}

variable "enable_apis" {
  description = "Enable the Google Cloud APIs the deployment uses. Set to false when someone else manages the project's APIs."
  type        = bool
  default     = true
}

# --- Configuration from the stack-config module ------------------------------

variable "bundle" {
  description = "The configuration bundle (output of the stack-config module). Stored in Secret Manager; the instance fetches it with its service account."
  type        = string
  sensitive   = true
}

variable "basic_auth_password" {
  description = "Password of the shared login, stored in a second secret for the people who operate the deployment. The instance cannot read it."
  type        = string
  sensitive   = true
}

# --- Network -----------------------------------------------------------------

variable "subnetwork" {
  description = "Self link or id of an existing subnetwork in region to place the instance in. Leave null to create a network with one subnetwork."
  type        = string
  default     = null
}

variable "subnet_cidr" {
  description = "Address range of the subnetwork that is created when subnetwork is null."
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

variable "enable_iap_ssh" {
  description = "Allow SSH from Google's Identity-Aware Proxy range only (gcloud compute ssh --tunnel-through-iap). Port 22 is never open to the internet."
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Domain the site is served on, or null. With a domain, port 80 is open to the world (the certificate authority checks the domain there, and it redirects to HTTPS)."
  type        = string
  default     = null
}

variable "dns_managed_zone" {
  description = "Name of the Cloud DNS managed zone (in this project) in which to create the A record for domain_name. Leave null when DNS is managed elsewhere, and point the domain at the public_ip output yourself."
  type        = string
  default     = null

  validation {
    condition     = var.dns_managed_zone == null || var.domain_name != null
    error_message = "dns_managed_zone needs domain_name."
  }
}

# --- Instance ----------------------------------------------------------------

variable "machine_type" {
  description = "Machine type without the assistant. Must be x86_64 (the backend image is linux/amd64 only)."
  type        = string
  default     = "e2-standard-4"
}

variable "enable_assistant" {
  description = "Use assistant_machine_type with a GPU, for the dataset assistant's model. Set the same value in the stack-config module."
  type        = bool
  default     = false
}

variable "assistant_machine_type" {
  description = "Machine type with the assistant. Must be a type GPUs can be attached to (N1), or a type with a built-in GPU (G2; then set gpu_count to 0)."
  type        = string
  default     = "n1-standard-8"
}

variable "gpu_type" {
  description = "GPU attached with the assistant."
  type        = string
  default     = "nvidia-tesla-t4"
}

variable "gpu_count" {
  description = "Number of GPUs attached with the assistant. 0 for machine types that include their GPU."
  type        = number
  default     = 1

  validation {
    condition     = contains([0, 1, 2, 4], var.gpu_count)
    error_message = "gpu_count must be 0, 1, 2 or 4."
  }
}

variable "boot_image" {
  description = "Boot image, as project/family or a full image path. The image of a running instance is never changed by a later apply."
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
}

variable "boot_disk_size_gb" {
  description = "Size of the system disk, which also holds the container images (and the NVIDIA driver with the assistant)."
  type        = number
  default     = 60

  validation {
    condition     = var.boot_disk_size_gb >= 30
    error_message = "boot_disk_size_gb must be at least 30: the application images alone take about 15 GB."
  }
}

variable "enable_secure_boot" {
  description = "Shielded VM secure boot. Ubuntu's packaged NVIDIA driver is signed and loads with it; switch it off only if you install an unsigned kernel module."
  type        = bool
  default     = true
}

variable "config_poll_minutes" {
  description = "How often the instance checks Secret Manager for a changed configuration."
  type        = number
  default     = 5
}

# --- Data disk ---------------------------------------------------------------

variable "data_disk_size_gb" {
  description = "Size of the data disk (datasets, databases, certificates, model files). It can be enlarged later, never shrunk."
  type        = number
  default     = 200

  validation {
    condition     = var.data_disk_size_gb >= 20
    error_message = "data_disk_size_gb must be at least 20."
  }
}

variable "data_disk_type" {
  description = "Persistent disk type of the data disk."
  type        = string
  default     = "pd-balanced"

  validation {
    condition     = contains(["pd-standard", "pd-balanced", "pd-ssd"], var.data_disk_type)
    error_message = "data_disk_type must be one of pd-standard, pd-balanced, pd-ssd."
  }
}

variable "data_disk_snapshot" {
  description = "Name or self link of a snapshot to create the data disk from (restoring a backup). Only read when the disk is created; see the README for the restore procedure."
  type        = string
  default     = null
}

# --- Backups -----------------------------------------------------------------

variable "enable_snapshots" {
  description = "Take a daily snapshot of the data disk (a snapshot schedule)."
  type        = bool
  default     = true
}

variable "snapshot_retention_days" {
  description = "How many days snapshots are kept."
  type        = number
  default     = 14

  validation {
    condition     = var.snapshot_retention_days >= 1 && floor(var.snapshot_retention_days) == var.snapshot_retention_days
    error_message = "snapshot_retention_days must be a whole number of at least 1."
  }
}

variable "snapshot_time_utc" {
  description = "Start of the daily snapshot window, in UTC, on the hour (HH:00)."
  type        = string
  default     = "03:00"

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):00$", var.snapshot_time_utc))
    error_message = "snapshot_time_utc must be on the hour, as HH:00."
  }
}

# --- Registry ----------------------------------------------------------------

variable "create_registry" {
  description = "Create an Artifact Registry Docker repository named after the deployment. Set to false when the images live in a registry that needs no login."
  type        = bool
  default     = true
}

variable "registry_keep_images" {
  description = "How many recent versions of each image the repository always keeps; other versions are deleted once they are 30 days old."
  type        = number
  default     = 10

  validation {
    condition     = var.registry_keep_images >= 2
    error_message = "registry_keep_images must be at least 2 (the running release and the next one)."
  }
}
