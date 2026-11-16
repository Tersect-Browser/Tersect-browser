# Tersect Browser on Google Cloud: one Compute Engine instance running the
# production compose stack. See ../../README.md for the walk-through.

locals {
  # Images in this deployment's Artifact Registry repository, unless given in full.
  images = var.images != null ? var.images : {
    web      = "${module.vm.registry}/web:${var.image_tag}"
    backend  = "${module.vm.registry}/backend:${var.image_tag}"
    pipeline = "${module.vm.registry}/pipeline:${var.image_tag}"
  }
}

# What runs on the machine: passwords, .env, access control, the bundle.
module "config" {
  source = "../../modules/stack-config"

  name        = var.name
  domain_name = var.domain_name
  public_ip   = module.vm.public_ip
  acme_email  = var.acme_email
  images      = local.images

  basic_auth_username = var.basic_auth_username
  basic_auth_password = var.basic_auth_password
  allowed_cidrs       = var.allowed_cidrs

  enable_assistant      = var.enable_assistant
  assistant_model       = var.assistant_model
  clickhouse_low_memory = var.clickhouse_low_memory
}

# The machine and everything around it.
module "vm" {
  source = "../../modules/gcp-vm"

  name        = var.name
  project_id  = var.project_id
  region      = var.region
  zone        = var.zone
  enable_apis = var.enable_apis

  bundle              = module.config.bundle
  basic_auth_password = module.config.basic_auth_password

  subnetwork       = var.subnetwork
  allowed_cidrs    = var.allowed_cidrs
  domain_name      = var.domain_name
  dns_managed_zone = var.dns_managed_zone

  machine_type           = var.machine_type
  enable_assistant       = var.enable_assistant
  assistant_machine_type = var.assistant_machine_type
  gpu_type               = var.gpu_type

  data_disk_size_gb  = var.data_disk_size_gb
  data_disk_snapshot = var.data_disk_snapshot

  enable_snapshots        = var.enable_snapshots
  snapshot_retention_days = var.snapshot_retention_days

  create_registry = var.images == null
}
