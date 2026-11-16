# Tersect Browser on a Slurm cluster with Apptainer: the production stack as
# one long-running job of your own user, reached through an SSH tunnel.
# See ../../modules/hpc-slurm/README.md and ../../../hpc/README.md.

module "hpc" {
  source = "../../modules/hpc-slurm"

  name                         = var.name
  login_host                   = var.login_host
  ssh_user                     = var.ssh_user
  ssh_port                     = var.ssh_port
  ssh_private_key_path         = var.ssh_private_key_path
  ssh_host_key                 = var.ssh_host_key
  ssh_bastion_host             = var.ssh_bastion_host
  ssh_bastion_user             = var.ssh_bastion_user
  ssh_bastion_port             = var.ssh_bastion_port
  ssh_bastion_private_key_path = var.ssh_bastion_private_key_path
  ssh_timeout                  = var.ssh_timeout
  deploy_dir                   = var.deploy_dir
  data_dir                     = var.data_dir
  shared_dir                   = var.shared_dir
  node_local_dir               = var.node_local_dir
  image_web                    = var.image_web
  image_backend                = var.image_backend
  image_pipeline               = var.image_pipeline
  image_mongo                  = var.image_mongo
  image_clickhouse             = var.image_clickhouse
  image_ollama                 = var.image_ollama
  registry_username            = var.registry_username
  registry_password            = var.registry_password
  pull_on                      = var.pull_on
  apptainer_command            = var.apptainer_command
  environment_modules          = var.environment_modules
  apptainer_flags              = var.apptainer_flags
  bind_address                 = var.bind_address
  http_port                    = var.http_port
  service_ports                = var.service_ports
  tunnel_local_port            = var.tunnel_local_port
  basic_auth_username          = var.basic_auth_username
  basic_auth_password          = var.basic_auth_password
  submit_job                   = var.submit_job
  partition                    = var.partition
  account                      = var.account
  qos                          = var.qos
  time_limit                   = var.time_limit
  auto_resubmit                = var.auto_resubmit
  stop_grace_seconds           = var.stop_grace_seconds
  cpus                         = var.cpus
  memory_gb                    = var.memory_gb
  gres                         = var.gres
  sbatch_extra_options         = var.sbatch_extra_options
  wait_for_start_seconds       = var.wait_for_start_seconds
  database_name                = var.database_name
  mongo_username               = var.mongo_username
  mongo_cache_gb               = var.mongo_cache_gb
  clickhouse_low_memory        = var.clickhouse_low_memory
  build_cores                  = var.build_cores
  enable_assistant             = var.enable_assistant
  assistant_url                = var.assistant_url
  assistant_api_key            = var.assistant_api_key
  assistant_model              = var.assistant_model
  assistant_context_chars      = var.assistant_context_chars
  ollama_context_length        = var.ollama_context_length
}
