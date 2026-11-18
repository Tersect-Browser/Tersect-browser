# Tersect Browser on AWS: one EC2 instance running the production compose
# stack. See ../../README.md for the walk-through.

locals {
  # Images in this deployment's ECR repositories, unless given in full.
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
  source = "../../modules/aws-vm"

  name = var.name

  bundle              = module.config.bundle
  basic_auth_password = module.config.basic_auth_password

  subnet_id         = var.subnet_id
  availability_zone = var.availability_zone
  allowed_cidrs     = var.allowed_cidrs
  domain_name       = var.domain_name
  route53_zone_id   = var.route53_zone_id

  instance_type           = var.instance_type
  enable_assistant        = var.enable_assistant
  assistant_instance_type = var.assistant_instance_type

  data_volume_size_gb     = var.data_volume_size_gb
  data_volume_snapshot_id = var.data_volume_snapshot_id

  enable_snapshots        = var.enable_snapshots
  snapshot_retention_days = var.snapshot_retention_days

  create_registry       = var.images == null
  registry_force_delete = var.registry_force_delete
}
