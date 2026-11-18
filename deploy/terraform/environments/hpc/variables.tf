variable "name" {
  description = "Name of the deployment. Used as the Slurm job name and in messages; the cloud modules use the same value as a resource prefix."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name))
    error_message = "name must be 3 to 22 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

# --- How Terraform reaches the cluster ---------------------------------------

variable "login_host" {
  description = "Host name of the cluster's login node (for example login.hpc.example.org). Files are uploaded and Slurm commands run there over SSH."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$", var.login_host))
    error_message = "login_host must be a host name or IPv4 address, without a user name or port."
  }
}

variable "ssh_user" {
  description = "Your user name on the cluster. The job runs as this user."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z_][A-Za-z0-9._-]*$", var.ssh_user))
    error_message = "ssh_user must be a Unix user name."
  }
}

variable "ssh_port" {
  description = "SSH port of the login node."
  type        = number
  default     = 22

  validation {
    condition     = var.ssh_port >= 1 && var.ssh_port <= 65535 && floor(var.ssh_port) == var.ssh_port
    error_message = "ssh_port must be a port number."
  }
}

variable "ssh_private_key_path" {
  description = "Path of the private key to log in with (no passphrase). Leave null to use the SSH agent, which is the only way to use a key with a passphrase. Only the path is stored in the state, never the key; passwords are not supported."
  type        = string
  default     = null
}

variable "ssh_host_key" {
  description = "Public host key of the login node (one line, as in known_hosts without the host name). Terraform does not read known_hosts; without this the host is not verified."
  type        = string
  default     = null
}

variable "ssh_bastion_host" {
  description = "Jump host to go through to reach the login node, if it is not reachable directly. Leave null for none."
  type        = string
  default     = null

  validation {
    condition     = var.ssh_bastion_host == null || can(regex("^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$", var.ssh_bastion_host))
    error_message = "ssh_bastion_host must be a host name or IPv4 address."
  }
}

variable "ssh_bastion_user" {
  description = "User name on the jump host. Defaults to ssh_user."
  type        = string
  default     = null
}

variable "ssh_bastion_port" {
  description = "SSH port of the jump host."
  type        = number
  default     = 22
}

variable "ssh_bastion_private_key_path" {
  description = "Private key for the jump host. Defaults to ssh_private_key_path (or the agent)."
  type        = string
  default     = null
}

variable "ssh_timeout" {
  description = "How long to wait for the SSH connection."
  type        = string
  default     = "2m"
}

# --- Where it lives on the cluster -------------------------------------------

variable "deploy_dir" {
  description = "Absolute path of the deployment directory on the cluster, on a filesystem every compute node sees (project or scratch space, not home: the images take 10 GB or more). Created with mode 0700 if missing."
  type        = string

  validation {
    condition     = can(regex("^/[A-Za-z0-9._/-]+[A-Za-z0-9._-]$", var.deploy_dir)) && !strcontains(var.deploy_dir, "..")
    error_message = "deploy_dir must be an absolute path made of letters, digits, dot, underscore, hyphen and slash, without a trailing slash."
  }
}

variable "data_dir" {
  description = "Absolute path for all persistent data (datasets, uploads, databases), on a shared filesystem. Defaults to <deploy_dir>/data. terraform destroy never removes it."
  type        = string
  default     = null

  validation {
    condition     = var.data_dir == null || (can(regex("^/[A-Za-z0-9._/-]+[A-Za-z0-9._-]$", var.data_dir)) && !strcontains(coalesce(var.data_dir, "/x"), ".."))
    error_message = "data_dir must be an absolute path without spaces or a trailing slash."
  }
}

variable "shared_dir" {
  description = "Existing folder users may pick input files from in the dataset wizard (\"server folder\"), mounted read-only; for example the group's VCF archive. Defaults to <data_dir>/shared."
  type        = string
  default     = null

  validation {
    condition     = var.shared_dir == null || (can(regex("^/[A-Za-z0-9._/-]+$", var.shared_dir)) && !strcontains(coalesce(var.shared_dir, "/x"), ".."))
    error_message = "shared_dir must be an absolute path without spaces."
  }
}

variable "node_local_dir" {
  description = "Run MongoDB and ClickHouse on the compute node's own disk instead of the shared filesystem: a directory on the node (\"/local/scratch\"), or the name of a variable set inside jobs (\"$TMPDIR\"). The databases are copied there at start and copied back at stop; if the job is killed without warning, changes since the start are lost. Leave null (the default) to keep them in data_dir. See deploy/hpc/README.md."
  type        = string
  default     = null

  validation {
    condition     = var.node_local_dir == null || can(regex("^(/[A-Za-z0-9._/-]+|\\$[A-Za-z_][A-Za-z0-9_]*)$", var.node_local_dir))
    error_message = "node_local_dir must be an absolute path or a variable name such as $TMPDIR."
  }
}

# --- Images ------------------------------------------------------------------

variable "image_web" {
  description = "Web image (proxy and built app): registry/repository:tag as pushed by deploy/scripts/push-images.sh, any URI Apptainer can pull (oras://...), or the absolute path of a .sif file already on the cluster."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_web))
    error_message = "image_web must be an image reference or a path, without spaces."
  }
}

variable "image_backend" {
  description = "Backend image; same forms as image_web."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_backend))
    error_message = "image_backend must be an image reference or a path, without spaces."
  }
}

variable "image_pipeline" {
  description = "Pipeline image (the builder service and the dataset builds); same forms as image_web."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_pipeline))
    error_message = "image_pipeline must be an image reference or a path, without spaces."
  }
}

variable "image_mongo" {
  description = "MongoDB image. Keep the major version of deploy/compose/docker-compose.yml. Docker Hub limits anonymous pulls per IP address, which a login node shares with everyone: mirror it to your registry if pulls are refused."
  type        = string
  default     = "mongo:8.0"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_mongo))
    error_message = "image_mongo must be an image reference or a path, without spaces."
  }
}

variable "image_clickhouse" {
  description = "ClickHouse image. Keep the version of deploy/compose/docker-compose.yml."
  type        = string
  default     = "clickhouse/clickhouse-server:25.8"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_clickhouse))
    error_message = "image_clickhouse must be an image reference or a path, without spaces."
  }
}

variable "image_ollama" {
  description = "Ollama image, used only when the assistant's model runs inside the job (enable_assistant without assistant_url)."
  type        = string
  default     = "ollama/ollama:0.40.16"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@+-]+$", var.image_ollama))
    error_message = "image_ollama must be an image reference or a path, without spaces."
  }
}

variable "registry_username" {
  description = "User name for the registry of the application images (APPTAINER_DOCKER_USERNAME). Leave null for a public registry. Sent only to the registry image_web is on."
  type        = string
  default     = null
}

variable "registry_password" {
  description = "Password or token for the registry (APPTAINER_DOCKER_PASSWORD). Written to secrets.env (mode 0600) on the cluster, where the pull needs it; use a read-only token. Prefer TF_VAR_registry_password over a tfvars file."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.registry_password == null || !strcontains(coalesce(var.registry_password, "x"), "'")
    error_message = "registry_password must not contain a single quote."
  }
}

variable "pull_on" {
  description = "Where the images are pulled and converted to SIF files: \"login\" (on the login node, during terraform apply; compute nodes often have no internet access) or \"job\" (inside the Slurm job, when the login node forbids heavy work and the compute nodes can reach the registry)."
  type        = string
  default     = "login"

  validation {
    condition     = contains(["login", "job"], var.pull_on)
    error_message = "pull_on must be \"login\" or \"job\"."
  }
}

# --- Apptainer ---------------------------------------------------------------

variable "apptainer_command" {
  description = "The container runtime's command: \"apptainer\", \"singularity\", or an absolute path."
  type        = string
  default     = "apptainer"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+$", var.apptainer_command))
    error_message = "apptainer_command must be a command name or path."
  }
}

variable "environment_modules" {
  description = "Environment modules to load when the runtime is not on the PATH, for example [\"apptainer\"] (module load apptainer)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for m in var.environment_modules : can(regex("^[A-Za-z0-9._/+-]+$", m))])
    error_message = "environment_modules must be module names such as apptainer or apptainer/1.3.4."
  }
}

variable "apptainer_flags" {
  description = "Isolation options given to every container. The default hides the host's home, /tmp and environment and gives each service its own PID namespace. If your site's Apptainer cannot do this, try \"--contain --cleanenv --no-home\"; do not drop --cleanenv."
  type        = string
  default     = "--containall --no-home"

  validation {
    condition     = can(regex("^[A-Za-z0-9 =._/:,-]*$", var.apptainer_flags))
    error_message = "apptainer_flags must be plain command-line options."
  }
}

# --- Network -----------------------------------------------------------------

variable "bind_address" {
  description = "Address on the compute node the site listens on. \"127.0.0.1\" (default) is reachable only from the node itself, so the SSH tunnel must end on the compute node. \"0.0.0.0\" (or the node's cluster-network address) lets the tunnel end on the login node, and lets every machine on the cluster network reach the password prompt over plain HTTP. The databases and the application services stay on 127.0.0.1 either way."
  type        = string
  default     = "127.0.0.1"

  validation {
    condition     = can(cidrhost("${var.bind_address}/32", 0))
    error_message = "bind_address must be an IPv4 address."
  }
}

variable "http_port" {
  description = "Port the site listens on, on the compute node. Ports are per node, not per user: two deployments on one node need different ports (this applies to all the port variables)."
  type        = number
  default     = 8080

  validation {
    condition     = var.http_port >= 1024 && var.http_port <= 65535 && floor(var.http_port) == var.http_port
    error_message = "http_port must be between 1024 and 65535 (ordinary users cannot open lower ports)."
  }
}

variable "service_ports" {
  description = "Localhost ports of the internal services. Deliberately not the usual ones, so that the stack does not collide with another user's database on the same node."
  type = object({
    backend         = optional(number, 14300)
    builder         = optional(number, 14310)
    mongo           = optional(number, 27117)
    clickhouse_http = optional(number, 18123)
    clickhouse_tcp  = optional(number, 19000)
    ollama          = optional(number, 21434)
  })
  default = {}

  validation {
    condition     = alltrue([for p in values(var.service_ports) : p >= 1024 && p <= 65535 && floor(p) == p])
    error_message = "service_ports must be between 1024 and 65535."
  }

  validation {
    condition     = length(distinct(values(var.service_ports))) == length(values(var.service_ports))
    error_message = "service_ports must all be different."
  }
}

variable "tunnel_local_port" {
  description = "Port on your own computer that the SSH tunnel forwards. The app builds its download links from it, so use the tunnel command exactly as printed."
  type        = number
  default     = 8080

  validation {
    condition     = var.tunnel_local_port >= 1 && var.tunnel_local_port <= 65535 && floor(var.tunnel_local_port) == var.tunnel_local_port
    error_message = "tunnel_local_port must be a port number."
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
  description = "Password of the shared login. Leave null to generate one (read it from the outputs). The app has no accounts and other users of the cluster can reach ports on a compute node, so there is always a password."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.basic_auth_password == null || (length(coalesce(var.basic_auth_password, "x")) >= 12 && length(coalesce(var.basic_auth_password, "x")) <= 72 && !strcontains(coalesce(var.basic_auth_password, "x"), "'"))
    error_message = "basic_auth_password must be 12 to 72 characters (bcrypt ignores anything after 72) and must not contain a single quote."
  }
}

# --- The Slurm job -----------------------------------------------------------

variable "submit_job" {
  description = "Submit the job at the end of terraform apply. Set to false to only install the files (and pull the images) and submit by hand."
  type        = bool
  default     = true
}

variable "partition" {
  description = "Slurm partition. Leave null for the cluster's default. Pick one that allows long jobs."
  type        = string
  default     = null

  validation {
    condition     = var.partition == null || can(regex("^[A-Za-z0-9_.,-]+$", var.partition))
    error_message = "partition must be a partition name (or a comma-separated list)."
  }
}

variable "account" {
  description = "Slurm account to charge. Leave null for your default."
  type        = string
  default     = null

  validation {
    condition     = var.account == null || can(regex("^[A-Za-z0-9_.-]+$", var.account))
    error_message = "account must be an account name."
  }
}

variable "qos" {
  description = "Slurm quality of service. Leave null for the default."
  type        = string
  default     = null

  validation {
    condition     = var.qos == null || can(regex("^[A-Za-z0-9_.-]+$", var.qos))
    error_message = "qos must be a QOS name."
  }
}

variable "time_limit" {
  description = "Wall time of one job, in Slurm's format (\"1-00:00:00\" is one day). Set it to the longest your partition allows: every job end restarts the stack and interrupts a dataset build that is running."
  type        = string
  default     = "1-00:00:00"

  validation {
    condition     = can(regex("^([0-9]+-[0-9]{1,2}(:[0-9]{2}){0,2}|[0-9]+(:[0-9]{2}){0,2})$", var.time_limit))
    error_message = "time_limit must be a Slurm time: minutes, hours:minutes:seconds, or days-hours[:minutes[:seconds]]."
  }
}

variable "auto_resubmit" {
  description = "Queue the job again when it reaches its time limit, so the site comes back without anyone doing anything (after the queue wait). It is not resubmitted after a cancel or a failure."
  type        = bool
  default     = true
}

variable "stop_grace_seconds" {
  description = "How long before the time limit Slurm warns the job, which is the time the stack has to stop cleanly (and, with node_local_dir, to copy the databases back). Raise it with node_local_dir and many datasets."
  type        = number
  default     = 300

  validation {
    condition     = var.stop_grace_seconds >= 120 && var.stop_grace_seconds <= 65535 && floor(var.stop_grace_seconds) == var.stop_grace_seconds
    error_message = "stop_grace_seconds must be between 120 and 65535."
  }
}

variable "cpus" {
  description = "CPUs of the job. Dataset builds run inside the job and use all of them (Snakemake --cores), next to the databases."
  type        = number
  default     = 8

  validation {
    condition     = var.cpus >= 2 && floor(var.cpus) == var.cpus
    error_message = "cpus must be a whole number of at least 2."
  }
}

variable "memory_gb" {
  description = "Memory of the job in GB, shared by the databases, the services and the dataset builds. 32 is a sensible minimum for building real datasets; 16 is enough to browse existing ones."
  type        = number
  default     = 32

  validation {
    condition     = var.memory_gb >= 8 && floor(var.memory_gb) == var.memory_gb
    error_message = "memory_gb must be a whole number of at least 8."
  }
}

variable "gres" {
  description = "Generic resources to request, for example \"gpu:1\" when the assistant's model runs inside the job. Leave null for none."
  type        = string
  default     = null

  validation {
    condition     = var.gres == null || can(regex("^[A-Za-z0-9_.:,-]+$", var.gres))
    error_message = "gres must look like gpu:1 or gpu:a100:1."
  }
}

variable "sbatch_extra_options" {
  description = "Further sbatch options, one per item, written as #SBATCH lines; for example [\"--constraint=avx2\", \"--exclusive=user\"]."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for o in var.sbatch_extra_options : can(regex("^--?[A-Za-z][A-Za-z0-9-]*([= ][A-Za-z0-9_.,:/@%+=-]+)?$", o))])
    error_message = "sbatch_extra_options items must be single options such as --constraint=avx2."
  }
}

variable "wait_for_start_seconds" {
  description = "After submitting, wait up to this long for the stack to come up and print the tunnel command in the apply log. Not an error if the job is still queued. 0 does not wait."
  type        = number
  default     = 120

  validation {
    condition     = var.wait_for_start_seconds >= 0 && floor(var.wait_for_start_seconds) == var.wait_for_start_seconds
    error_message = "wait_for_start_seconds must be zero or a positive whole number."
  }
}

# --- Application settings ----------------------------------------------------

variable "database_name" {
  description = "Name of the MongoDB application database."
  type        = string
  default     = "tersect_browser_gp"

  validation {
    condition     = can(regex("^[A-Za-z0-9_]{1,63}$", var.database_name))
    error_message = "database_name may contain letters, digits and underscore."
  }
}

variable "mongo_username" {
  description = "Name of the MongoDB application user."
  type        = string
  default     = "tersect"

  validation {
    condition     = can(regex("^[A-Za-z0-9_]{1,63}$", var.mongo_username))
    error_message = "mongo_username may contain letters, digits and underscore."
  }
}

variable "mongo_cache_gb" {
  description = "MongoDB's cache size in GB. Set explicitly because MongoDB would otherwise size it from the node's memory, not the job's. It holds only dataset records and build history, so 1 is plenty."
  type        = number
  default     = 1

  validation {
    condition     = var.mongo_cache_gb >= 0.25
    error_message = "mongo_cache_gb must be at least 0.25."
  }
}

variable "clickhouse_low_memory" {
  description = "Apply the small-host ClickHouse settings (clickhouse/low-memory.xml). Kept on by default here even with 32 GB, because the job's memory is shared with dataset builds."
  type        = bool
  default     = true
}

variable "build_cores" {
  description = "Cores a dataset build may use. Defaults to cpus."
  type        = number
  default     = null

  validation {
    condition     = var.build_cores == null || (coalesce(var.build_cores, 1) >= 1 && floor(coalesce(var.build_cores, 1)) == coalesce(var.build_cores, 1))
    error_message = "build_cores must be a positive whole number."
  }
}

# --- Dataset assistant -------------------------------------------------------

variable "enable_assistant" {
  description = "Turn on the dataset assistant. With assistant_url it uses that model server; without, the job runs Ollama itself, which needs a GPU (gres) to be usable."
  type        = bool
  default     = false
}

variable "assistant_url" {
  description = "Base URL (including /v1) of an existing OpenAI-compatible model server reachable from the compute nodes, for example the university's own. Used only with enable_assistant."
  type        = string
  default     = null

  validation {
    condition     = var.assistant_url == null || can(regex("^https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$", var.assistant_url))
    error_message = "assistant_url must be an http or https URL."
  }
}

variable "assistant_api_key" {
  description = "Bearer token for assistant_url, if that server needs one."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.assistant_api_key == null || !strcontains(coalesce(var.assistant_api_key, "x"), "'")
    error_message = "assistant_api_key must not contain a single quote."
  }
}

variable "assistant_model" {
  description = "Model the assistant uses. With Ollama in the job it is downloaded on first use of 'pull' or at job start."
  type        = string
  default     = "qwen3:14b"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:-]+$", var.assistant_model))
    error_message = "assistant_model must be a model name such as qwen3:14b."
  }
}

variable "assistant_context_chars" {
  description = "How many characters of context the builder sends to the model (TB_ASSISTANT_CONTEXT_CHARS)."
  type        = number
  default     = 24000
}

variable "ollama_context_length" {
  description = "Context window of the model in tokens (OLLAMA_CONTEXT_LENGTH), when Ollama runs in the job."
  type        = number
  default     = 16384
}
