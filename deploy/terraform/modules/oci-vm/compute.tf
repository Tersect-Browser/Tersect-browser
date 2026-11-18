# --- Image -------------------------------------------------------------------

data "oci_core_images" "ubuntu" {
  count = var.image_id == null ? 1 : 0

  # Canonical's Ubuntu 24.04 LTS images that run on the shape (so: the arm64
  # build for an Ampere shape), newest first.
  compartment_id           = local.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  image_id = var.image_id != null ? var.image_id : data.oci_core_images.ubuntu[0].images[0].id

  # Flexible shapes take a size; fixed shapes have one.
  flexible = endswith(var.shape, ".Flex")

  # Where the data volume appears on the machine (a "consistent device path").
  data_device = "/dev/oracleoci/oraclevdb"
}

# --- Boot script -------------------------------------------------------------

module "bootstrap" {
  source = "../vm-bootstrap"

  name                = var.name
  config_poll_minutes = var.config_poll_minutes
  follow_images       = var.follow_images
  cloud_hooks         = file("${path.module}/files/cloud.sh")

  data_device_candidates = [local.data_device]

  cloud_settings = {
    REGION         = var.region
    NAMESPACE      = local.namespace
    BUNDLE_BUCKET  = oci_objectstorage_bucket.config.name
    BUNDLE_OBJECT  = local.bundle_object
    REGISTRY_HOSTS = var.create_registry ? local.registry_host : ""
  }
}

# The boot script and the SSH key are read once, when the instance is made,
# and Oracle Cloud does not let them be changed afterwards. A change of either
# therefore replaces the instance; the data volume and the address stay.
resource "terraform_data" "first_boot" {
  input = sha256(join("\n", [module.bootstrap.script, var.ssh_public_key != null ? var.ssh_public_key : ""]))
}

# --- Instance ----------------------------------------------------------------

resource "oci_core_instance" "this" {
  compartment_id      = local.compartment_id
  availability_domain = local.availability_domain
  display_name        = var.name
  shape               = var.shape
  freeform_tags       = local.tags

  dynamic "shape_config" {
    for_each = local.flexible ? [1] : []

    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memory_gb
    }
  }

  source_details {
    source_type             = "image"
    source_id               = local.image_id
    boot_volume_size_in_gbs = var.boot_volume_size_gb
  }

  create_vnic_details {
    subnet_id = local.subnet_id
    nsg_ids   = [oci_core_network_security_group.this.id]
    # The reserved address below is attached once the instance exists; the
    # boot script retries its downloads until then.
    assign_public_ip = false
  }

  # No secrets in here: names only. cloud-init unpacks gzip by itself.
  metadata = merge(
    { user_data = base64gzip(module.bootstrap.script) },
    var.ssh_public_key != null ? { ssh_authorized_keys = var.ssh_public_key } : {},
  )

  instance_options {
    # Only the current metadata service, which refuses requests that were
    # forwarded to it.
    are_legacy_imds_endpoints_disabled = true
  }

  lifecycle {
    # A newer Ubuntu image must not replace a running machine, and metadata
    # changes go through first_boot (see above).
    ignore_changes = [source_details[0].source_id, metadata]

    # A new data volume (a restore) needs a fresh first boot as well.
    replace_triggered_by = [terraform_data.first_boot, oci_core_volume.data.id]
  }

  # Nothing here waits for the bundle or for the policy that lets the instance
  # read it: the bundle names the address, the address follows the instance,
  # and the policy names the instance. The machine's timer keeps trying until
  # all of them are there, a few minutes after the first boot.
}

# --- Data volume -------------------------------------------------------------
# Separate from the instance, so it outlives every replacement of it.
# Encrypted at rest like every block volume.

resource "oci_core_volume" "data" {
  compartment_id      = local.compartment_id
  availability_domain = local.availability_domain
  display_name        = "${var.name}-data"
  size_in_gbs         = var.data_volume_size_gb
  vpus_per_gb         = var.data_volume_vpus_per_gb
  freeform_tags       = local.tags

  dynamic "source_details" {
    for_each = var.data_volume_backup_id != null ? [1] : []

    content {
      type = "volumeBackup"
      id   = var.data_volume_backup_id
    }
  }

  lifecycle {
    # Read at creation only: removing the variable later must not wipe the
    # volume. To restore, replace this resource on purpose (see the README).
    ignore_changes = [source_details]

    # To make "terraform destroy" refuse to delete the data, uncomment:
    # prevent_destroy = true
  }
}

resource "oci_core_volume_attachment" "data" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.this.id
  volume_id       = oci_core_volume.data.id
  device          = local.data_device
  display_name    = "${var.name}-data"
}

# --- Address -----------------------------------------------------------------
# A reserved address: it stays the same when the instance is replaced.

data "oci_core_private_ips" "instance" {
  subnet_id  = local.subnet_id
  ip_address = oci_core_instance.this.private_ip
}

resource "oci_core_public_ip" "this" {
  compartment_id = local.compartment_id
  display_name   = var.name
  lifetime       = "RESERVED"
  private_ip_id  = data.oci_core_private_ips.instance.private_ips[0].id
  freeform_tags  = local.tags
}
