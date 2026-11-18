variable "name" {
  description = "Name of the deployment. Used in file headers only; the cloud modules use the same value as a resource prefix."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

# --- Where the site is served ------------------------------------------------

variable "domain_name" {
  description = "Domain the site is served on (for example tersect.example.org). Caddy obtains a certificate for it automatically. Leave null to serve on the IP address with a self-signed certificate."
  type        = string
  default     = null

  validation {
    condition     = var.domain_name == null || can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "domain_name must be a lowercase host name such as tersect.example.org (no scheme, no trailing dot)."
  }
}

variable "public_ip" {
  description = "Public IP address of the machine. Used as the site address when domain_name is null."
  type        = string
}

variable "acme_email" {
  description = "Contact address given to the certificate authority (Let's Encrypt) for expiry notices. Only used with domain_name."
  type        = string
  default     = null

  validation {
    condition     = var.acme_email == null || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.acme_email))
    error_message = "acme_email must be an email address."
  }
}

# --- Images ------------------------------------------------------------------

variable "images" {
  description = "Full image references (registry/repository:tag) of the three application images, as pushed by deploy/scripts/push-images.sh."
  type = object({
    web      = string
    backend  = string
    pipeline = string
  })

  validation {
    condition     = alltrue([for image in values(var.images) : length(regexall("\\s", image)) == 0 && length(image) > 0])
    error_message = "Image references must be non-empty and contain no whitespace."
  }
}

# --- Access control ----------------------------------------------------------

variable "basic_auth_username" {
  description = "User name of the shared login."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]{1,64}$", var.basic_auth_username))
    error_message = "basic_auth_username may contain letters, digits, dot, underscore and hyphen."
  }
}

variable "basic_auth_password" {
  description = "Password of the shared login. Leave null to generate one (read it from the outputs)."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.basic_auth_password == null || (length(coalesce(var.basic_auth_password, "x")) >= 12 && length(coalesce(var.basic_auth_password, "x")) <= 72)
    error_message = "basic_auth_password must be 12 to 72 characters (bcrypt ignores anything after 72)."
  }
}

variable "allowed_cidrs" {
  description = "Networks allowed to use the site, in CIDR notation. The default allows everyone; the cloud firewall and the proxy both enforce this list."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.allowed_cidrs) > 0 && alltrue([for cidr in var.allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "allowed_cidrs must be a non-empty list of CIDR blocks such as 203.0.113.0/24 or 198.51.100.7/32."
  }
}

# --- Application settings ----------------------------------------------------

variable "data_dir" {
  description = "Directory on the machine that holds all state (the mount point of the data disk)."
  type        = string
  default     = "/data"

  validation {
    condition     = can(regex("^/[A-Za-z0-9/_-]+$", var.data_dir))
    error_message = "data_dir must be an absolute path without spaces."
  }
}

variable "database_name" {
  description = "Name of the MongoDB application database."
  type        = string
  default     = "tersect_browser_gp"
}

variable "mongo_username" {
  description = "Name of the MongoDB application user."
  type        = string
  default     = "tersect"
}

variable "clickhouse_low_memory" {
  description = "Apply the small-host ClickHouse settings (clickhouse/low-memory.xml). Set to false on a machine with 32 GB of memory or more to run ClickHouse with its own defaults."
  type        = bool
  default     = true
}

# --- Dataset assistant -------------------------------------------------------

variable "enable_assistant" {
  description = "Run the dataset assistant's local model (the ollama service of the compose file). Needs a machine with an NVIDIA GPU."
  type        = bool
  default     = false
}

variable "assistant_model" {
  description = "Ollama model the assistant uses. It is downloaded on the machine at start."
  type        = string
  default     = "qwen3:14b"
}

variable "assistant_context_chars" {
  description = "How many characters of context the builder sends to the model (TB_ASSISTANT_CONTEXT_CHARS)."
  type        = number
  default     = 24000
}

variable "ollama_context_length" {
  description = "Context window of the model in tokens (OLLAMA_CONTEXT_LENGTH)."
  type        = number
  default     = 16384
}

# --- Sources -----------------------------------------------------------------

variable "compose_dir" {
  description = "Directory that holds docker-compose.yml and mongo-init.js. Defaults to deploy/compose of this repository."
  type        = string
  default     = null
}

variable "clickhouse_dir" {
  description = "Directory that holds schema.sql, users.sh and low-memory.xml. Defaults to clickhouse/ of this repository."
  type        = string
  default     = null
}
