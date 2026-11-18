# Tersect Browser on Oracle Cloud: one compute instance running the production
# compose stack. The defaults fit the Always Free allowance. See
# ../../README.md for the walk-through.

locals {
  # Images in this deployment's Container Registry repositories, unless given in full.
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

  # No GPU in the free allowance, so no local model.
  enable_assistant      = false
  clickhouse_low_memory = var.clickhouse_low_memory
}

# The machine and everything around it.
module "vm" {
  source = "../../modules/oci-vm"

  providers = {
    oci      = oci
    oci.home = oci.home
  }

  name                = var.name
  tags                = merge(var.tags, { application = "tersect-browser", managed-by = "terraform" })
  tenancy_ocid        = var.tenancy_ocid
  compartment_ocid    = var.compartment_ocid
  region              = var.region
  availability_domain = var.availability_domain

  bundle = module.config.bundle

  subnet_id         = var.subnet_id
  allowed_cidrs     = var.allowed_cidrs
  domain_name       = var.domain_name
  ssh_public_key    = var.ssh_public_key
  ssh_allowed_cidrs = var.ssh_allowed_cidrs

  follow_images = var.follow_images

  shape     = var.shape
  ocpus     = var.ocpus
  memory_gb = var.memory_gb
  image_id  = var.image_id

  boot_volume_size_gb   = var.boot_volume_size_gb
  data_volume_size_gb   = var.data_volume_size_gb
  data_volume_backup_id = var.data_volume_backup_id

  enable_backups        = var.enable_backups
  backup_retention_days = var.backup_retention_days

  create_registry = var.images == null
}
