variable "name" {
  description = "Name of the deployment (the resource prefix of the cloud module)."
  type        = string
}

variable "data_device_candidates" {
  description = "Device paths under which the data disk may appear, most specific first (for example /dev/disk/by-id/...). The first one that exists is used."
  type        = list(string)

  validation {
    condition     = length(var.data_device_candidates) > 0 && alltrue([for path in var.data_device_candidates : can(regex("^/dev/[A-Za-z0-9/_.-]+$", path))])
    error_message = "data_device_candidates must be a non-empty list of /dev/... paths."
  }
}

variable "data_dir" {
  description = "Mount point of the data disk. Must match TB_DATA_DIR of the stack configuration."
  type        = string
  default     = "/data"

  validation {
    condition     = can(regex("^/[A-Za-z0-9/_-]+$", var.data_dir))
    error_message = "data_dir must be an absolute path without spaces."
  }
}

variable "cloud_hooks" {
  description = "A bash file that defines three functions for this cloud: cloud_prepare (install what the others need), cloud_fetch_bundle (print the configuration bundle to standard output) and cloud_registry_login (log Docker in to the image registry). It may read the settings of cloud_settings."
  type        = string
}

variable "cloud_settings" {
  description = "Settings for the hooks, written to /etc/tersect/deploy.env as TERSECT_<KEY>=value. Names of things only, never secrets: this ends up in instance metadata."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for key, value in var.cloud_settings :
      can(regex("^[A-Z][A-Z0-9_]*$", key)) && can(regex("^[A-Za-z0-9 :/_.@=+-]*$", value))
    ])
    error_message = "cloud_settings keys must be UPPER_SNAKE_CASE and values may contain letters, digits, spaces and : / _ . @ = + -"
  }
}

variable "config_poll_minutes" {
  description = "How often the machine checks the secret store for a changed configuration bundle."
  type        = number
  default     = 5

  validation {
    condition     = var.config_poll_minutes >= 1 && var.config_poll_minutes <= 60 && floor(var.config_poll_minutes) == var.config_poll_minutes
    error_message = "config_poll_minutes must be a whole number from 1 to 60."
  }
}
