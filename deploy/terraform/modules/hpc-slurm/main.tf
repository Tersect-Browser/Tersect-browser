# Tersect Browser on a Slurm cluster, run with Apptainer by an ordinary user.
#
# There is no cloud API here: the module renders a deployment directory,
# uploads it to the login node over SSH and submits a Slurm job that runs the
# stack (deploy/hpc/). README.md explains why that is done with provisioners.

locals {
  hpc_dir        = "${path.module}/../../../hpc"
  clickhouse_dir = "${path.module}/../../../../clickhouse"

  data_dir   = coalesce(var.data_dir, "${var.deploy_dir}/data")
  shared_dir = coalesce(var.shared_dir, "${local.data_dir}/shared")

  # The assistant either talks to a model server that already exists, or the
  # job runs Ollama next to the other services.
  run_ollama    = var.enable_assistant && var.assistant_url == null
  assistant_url = var.enable_assistant && var.assistant_url != null ? var.assistant_url : ""

  basic_auth_password = coalesce(var.basic_auth_password, random_password.basic_auth.result)
  public_url          = "http://localhost:${var.tunnel_local_port}"
  ssh_login           = "${var.ssh_user}@${var.login_host}"

  # Settings read by tersect-stack.sh and tersect.sbatch. No secrets.
  stack_env = {
    TB_NAME                    = var.name
    TB_APPTAINER               = var.apptainer_command
    TB_MODULES                 = join(" ", var.environment_modules)
    TB_APPTAINER_FLAGS         = var.apptainer_flags
    TB_IMAGE_WEB               = var.image_web
    TB_IMAGE_BACKEND           = var.image_backend
    TB_IMAGE_PIPELINE          = var.image_pipeline
    TB_IMAGE_MONGO             = var.image_mongo
    TB_IMAGE_CLICKHOUSE        = var.image_clickhouse
    TB_IMAGE_OLLAMA            = var.image_ollama
    TB_PULL_ON                 = var.pull_on
    TB_DATA_DIR                = local.data_dir
    TB_SHARED_DIR              = local.shared_dir
    TB_NODE_LOCAL_DIR          = var.node_local_dir == null ? "" : var.node_local_dir
    TB_BIND_ADDRESS            = var.bind_address
    TB_HTTP_PORT               = tostring(var.http_port)
    TB_BACKEND_PORT            = tostring(var.service_ports.backend)
    TB_BUILDER_PORT            = tostring(var.service_ports.builder)
    TB_MONGO_PORT              = tostring(var.service_ports.mongo)
    TB_CLICKHOUSE_HTTP_PORT    = tostring(var.service_ports.clickhouse_http)
    TB_CLICKHOUSE_TCP_PORT     = tostring(var.service_ports.clickhouse_tcp)
    TB_OLLAMA_PORT             = tostring(var.service_ports.ollama)
    TB_TUNNEL_LOCAL_PORT       = tostring(var.tunnel_local_port)
    TB_PUBLIC_URL              = local.public_url
    TB_SSH_LOGIN               = local.ssh_login
    TB_SSH_PORT                = tostring(var.ssh_port)
    TB_DB_NAME                 = var.database_name
    TB_MONGO_USER              = var.mongo_username
    TB_MONGO_CACHE_GB          = tostring(var.mongo_cache_gb)
    TB_BASIC_AUTH_USER         = var.basic_auth_username
    TB_CLICKHOUSE_LOW_MEMORY   = var.clickhouse_low_memory ? "1" : "0"
    TB_BUILD_CORES             = tostring(coalesce(var.build_cores, var.cpus))
    TB_ASSISTANT_URL           = local.assistant_url
    TB_ASSISTANT_MODEL         = var.assistant_model
    TB_ASSISTANT_CONTEXT_CHARS = tostring(var.assistant_context_chars)
    TB_RUN_OLLAMA              = local.run_ollama ? "1" : "0"
    TB_OLLAMA_CONTEXT_LENGTH   = tostring(var.ollama_context_length)
    TB_AUTO_RESUBMIT           = var.auto_resubmit ? "1" : "0"
    TB_STOP_GRACE              = tostring(var.stop_grace_seconds)
  }

  # Passwords. Letters and digits only: they go into connection URLs.
  secrets_env = merge(
    {
      TB_MONGO_PASSWORD          = random_password.mongo_app.result
      MONGO_ROOT_PASSWORD        = random_password.mongo_root.result
      CLICKHOUSE_ADMIN_PASSWORD  = random_password.clickhouse_admin.result
      CLICKHOUSE_READER_PASSWORD = random_password.clickhouse_reader.result
      TB_BASIC_AUTH_PASSWORD     = local.basic_auth_password
    },
    var.assistant_api_key == null ? {} : { TB_ASSISTANT_API_KEY = var.assistant_api_key },
    var.registry_username == null ? {} : {
      APPTAINER_DOCKER_USERNAME = var.registry_username
      APPTAINER_DOCKER_PASSWORD = coalesce(var.registry_password, "-")
    },
  )

  env_header = "# Written by Terraform (deploy/terraform/modules/hpc-slurm); changes made here are overwritten by the next apply.\n"

  stack_env_content   = "${local.env_header}${join("\n", [for key, value in local.stack_env : "${key}='${value}'"])}\n"
  secrets_env_content = "${local.env_header}${join("\n", [for key, value in local.secrets_env : "${key}='${value}'"])}\n"

  # The job's options, written into tersect.sbatch in place of the defaults
  # between its two markers.
  sbatch_options = concat(
    [
      "--job-name=${var.name}",
      "--chdir=${var.deploy_dir}",
      "--output=${var.deploy_dir}/logs/slurm-%j.out",
      "--nodes=1",
      "--ntasks=1",
      "--cpus-per-task=${var.cpus}",
      "--mem=${var.memory_gb}G",
      "--time=${var.time_limit}",
      "--signal=B:TERM@${var.stop_grace_seconds}",
    ],
    var.partition == null ? [] : ["--partition=${var.partition}"],
    var.account == null ? [] : ["--account=${var.account}"],
    var.qos == null ? [] : ["--qos=${var.qos}"],
    var.gres == null ? [] : ["--gres=${var.gres}"],
    var.sbatch_extra_options,
  )
  sbatch_header = join("\n", [for option in local.sbatch_options : "#SBATCH ${option}"])
  sbatch_content = replace(
    file("${local.hpc_dir}/tersect.sbatch"),
    "/(?s)#@TB_SBATCH_BEGIN.*#@TB_SBATCH_END/",
    local.sbatch_header,
  )

  # Files that are uploaded as they are: destination (under deploy_dir) => source.
  static_files = {
    "tersect-stack.sh"          = "${local.hpc_dir}/tersect-stack.sh"
    "config/bind-localhost.cjs" = "${local.hpc_dir}/bind-localhost.cjs"
    "config/schema.sql"         = "${local.clickhouse_dir}/schema.sql"
    "config/low-memory.xml"     = "${local.clickhouse_dir}/low-memory.xml"
  }

  # Anything that changes what runs on the cluster changes this hash, which
  # replaces the deployment resource: cancel the job, upload, submit again.
  content_hash = nonsensitive(sha256(join("\n", concat(
    [local.stack_env_content, local.secrets_env_content, local.sbatch_content],
    [for destination, source in local.static_files : "${destination}=${filesha256(source)}"],
    ["submit=${var.submit_job}"],
  ))))

  stack_script = "${var.deploy_dir}/tersect-stack.sh"
  # Slurm and Apptainer are usually put on the PATH by the login profile.
  stack_command = "bash -lc '${local.stack_script} %s'"
}

resource "random_password" "mongo_root" {
  length  = 32
  special = false
}

resource "random_password" "mongo_app" {
  length  = 32
  special = false
}

resource "random_password" "clickhouse_admin" {
  length  = 32
  special = false
}

resource "random_password" "clickhouse_reader" {
  length  = 32
  special = false
}

resource "random_password" "basic_auth" {
  length  = 24
  special = false
}

resource "terraform_data" "deployment" {
  triggers_replace = {
    content    = local.content_hash
    deploy_dir = var.deploy_dir
    login      = "${local.ssh_login}:${var.ssh_port}"
  }

  # What the connection and the destroy-time provisioner need: they may only
  # refer to this resource's own attributes. Paths and names, no key material.
  input = {
    host                     = var.login_host
    user                     = var.ssh_user
    port                     = var.ssh_port
    private_key_path         = var.ssh_private_key_path
    host_key                 = var.ssh_host_key
    bastion_host             = var.ssh_bastion_host
    bastion_user             = var.ssh_bastion_host == null ? null : coalesce(var.ssh_bastion_user, var.ssh_user)
    bastion_port             = var.ssh_bastion_port
    bastion_private_key_path = var.ssh_bastion_private_key_path == null ? var.ssh_private_key_path : var.ssh_bastion_private_key_path
    timeout                  = var.ssh_timeout
    deploy_dir               = var.deploy_dir
    data_dir                 = local.data_dir
    submit_job               = var.submit_job
  }

  connection {
    type        = "ssh"
    host        = self.input.host
    user        = self.input.user
    port        = self.input.port
    timeout     = self.input.timeout
    host_key    = self.input.host_key
    agent       = self.input.private_key_path == null
    private_key = self.input.private_key_path == null ? null : file(pathexpand(self.input.private_key_path))

    bastion_host        = self.input.bastion_host
    bastion_user        = self.input.bastion_user
    bastion_port        = self.input.bastion_host == null ? null : self.input.bastion_port
    bastion_private_key = self.input.bastion_host == null || self.input.bastion_private_key_path == null ? null : file(pathexpand(self.input.bastion_private_key_path))
  }

  # 1. The directory, private from the start; secrets.env exists with mode
  #    0600 before anything is written into it. A job left from an earlier
  #    deployment of this directory is stopped first.
  provisioner "remote-exec" {
    inline = concat(
      [
        "set -eu",
        "umask 077",
        "mkdir -p '${var.deploy_dir}/config'",
        "touch '${var.deploy_dir}/secrets.env' '${var.deploy_dir}/stack.env'",
        "chmod 600 '${var.deploy_dir}/secrets.env' '${var.deploy_dir}/stack.env'",
      ],
      var.submit_job ? [
        "if [ -x '${local.stack_script}' ]; then ${format(local.stack_command, "cancel")}; fi",
      ] : [],
    )
  }

  # 2. The files.
  provisioner "file" {
    content     = local.secrets_env_content
    destination = "${var.deploy_dir}/secrets.env"
  }

  provisioner "file" {
    content     = local.stack_env_content
    destination = "${var.deploy_dir}/stack.env"
  }

  provisioner "file" {
    content     = local.sbatch_content
    destination = "${var.deploy_dir}/tersect.sbatch"
  }

  provisioner "file" {
    source      = local.static_files["tersect-stack.sh"]
    destination = "${var.deploy_dir}/tersect-stack.sh"
  }

  provisioner "file" {
    source      = local.static_files["config/bind-localhost.cjs"]
    destination = "${var.deploy_dir}/config/bind-localhost.cjs"
  }

  provisioner "file" {
    source      = local.static_files["config/schema.sql"]
    destination = "${var.deploy_dir}/config/schema.sql"
  }

  provisioner "file" {
    source      = local.static_files["config/low-memory.xml"]
    destination = "${var.deploy_dir}/config/low-memory.xml"
  }

  # 3. Images, then the job.
  provisioner "remote-exec" {
    inline = concat(
      [
        "set -eu",
        "chmod 700 '${local.stack_script}'",
        "chmod 600 '${var.deploy_dir}/secrets.env' '${var.deploy_dir}/stack.env'",
      ],
      var.pull_on == "login" ? [format(local.stack_command, "pull")] : [],
      var.submit_job ? [format(local.stack_command, "submit")] : [
        "echo 'Files installed. Submit the job with: ${local.stack_script} submit'",
      ],
      var.submit_job && var.wait_for_start_seconds > 0 ? [
        format(local.stack_command, "wait ${var.wait_for_start_seconds}"),
      ] : [],
    )
  }

  # On destroy (and before a redeployment): stop the job cleanly. Nothing on
  # disk is removed; deleting data is a decision for a person.
  provisioner "remote-exec" {
    when = destroy
    inline = [
      "set -eu",
      "if [ '${self.input.submit_job}' = true ] && [ -x '${self.input.deploy_dir}/tersect-stack.sh' ]; then bash -lc '${self.input.deploy_dir}/tersect-stack.sh cancel'; else echo 'No job managed by Terraform to cancel.'; fi",
      "echo 'Left in place: ${self.input.deploy_dir} (images, logs) and the data in ${self.input.data_dir}.'",
    ]
  }
}
