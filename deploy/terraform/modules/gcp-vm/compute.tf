locals {
  data_device_name = "tersect-data"
}

# --- Boot script -------------------------------------------------------------

module "bootstrap" {
  source = "../vm-bootstrap"

  name                = var.name
  config_poll_minutes = var.config_poll_minutes
  cloud_hooks         = file("${path.module}/files/cloud.sh")

  data_device_candidates = ["/dev/disk/by-id/google-${local.data_device_name}"]

  cloud_settings = {
    PROJECT        = var.project_id
    BUNDLE_ID      = google_secret_manager_secret.bundle.secret_id
    REGISTRY_HOSTS = var.create_registry ? local.registry_host : ""
  }
}

# --- Data disk ---------------------------------------------------------------
# Separate from the instance, so it outlives every replacement of it.
# Encrypted at rest like every persistent disk.

resource "google_compute_disk" "data" {
  project  = var.project_id
  name     = "${var.name}-data"
  zone     = var.zone
  type     = var.data_disk_type
  size     = var.data_disk_size_gb
  snapshot = var.data_disk_snapshot
  labels   = local.labels

  lifecycle {
    # Read at creation only: removing the variable later must not wipe the
    # disk. To restore, replace this resource on purpose (see the README).
    ignore_changes = [snapshot]

    # To make "terraform destroy" refuse to delete the data, uncomment:
    # prevent_destroy = true
  }

  depends_on = [google_project_service.this]
}

# --- Address -----------------------------------------------------------------

resource "google_compute_address" "this" {
  project      = var.project_id
  name         = var.name
  region       = var.region
  address_type = "EXTERNAL"
  labels       = local.labels

  depends_on = [google_project_service.this]
}

resource "google_dns_record_set" "this" {
  count = var.dns_managed_zone != null ? 1 : 0

  project      = var.project_id
  managed_zone = var.dns_managed_zone
  name         = "${var.domain_name}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.this.address]

  depends_on = [google_project_service.this]
}

# --- Instance ----------------------------------------------------------------

resource "google_compute_instance" "this" {
  project      = var.project_id
  name         = var.name
  zone         = var.zone
  machine_type = local.machine_type
  description  = "Tersect Browser ${var.name}"
  labels       = local.labels
  tags         = [var.name]

  # Changing the machine type (switching the assistant on) stops and starts
  # the instance instead of failing.
  allow_stopping_for_update = true

  boot_disk {
    auto_delete = true

    initialize_params {
      image  = var.boot_image
      size   = var.boot_disk_size_gb
      type   = "pd-balanced"
      labels = local.labels
    }
  }

  attached_disk {
    source      = google_compute_disk.data.self_link
    device_name = local.data_device_name
    mode        = "READ_WRITE"
  }

  network_interface {
    subnetwork = local.subnetwork

    access_config {
      nat_ip = google_compute_address.this.address
    }
  }

  service_account {
    email  = google_service_account.instance.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    # Logins are tied to Google identities and IAM, not to keys in metadata.
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    # No secrets in here: names only. Runs at every boot and is idempotent.
    startup-script = module.bootstrap.script
  }

  shielded_instance_config {
    enable_secure_boot          = var.enable_secure_boot
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  dynamic "guest_accelerator" {
    for_each = local.gpu_count > 0 ? [1] : []

    content {
      type  = var.gpu_type
      count = local.gpu_count
    }
  }

  scheduling {
    automatic_restart = true
    # Instances with a GPU cannot be live-migrated.
    on_host_maintenance = var.enable_assistant ? "TERMINATE" : "MIGRATE"
  }

  lifecycle {
    # A newer Ubuntu image must not replace a running machine.
    ignore_changes = [boot_disk[0].initialize_params[0].image]

    # When the data disk is replaced (a restore), the instance holding it has
    # to go first; disk_id only changes when the disk is created anew.
    replace_triggered_by = [google_compute_disk.data.disk_id]
  }

  depends_on = [
    google_secret_manager_secret_version.bundle,
    google_secret_manager_secret_iam_member.bundle,
    google_artifact_registry_repository_iam_member.pull,
  ]
}
