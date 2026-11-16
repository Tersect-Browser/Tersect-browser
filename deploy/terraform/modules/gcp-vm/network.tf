locals {
  create_network = var.subnetwork == null
  subnetwork     = local.create_network ? google_compute_subnetwork.this[0].self_link : data.google_compute_subnetwork.existing[0].self_link
  network        = local.create_network ? google_compute_network.this[0].self_link : data.google_compute_subnetwork.existing[0].network
}

data "google_compute_subnetwork" "existing" {
  count = local.create_network ? 0 : 1

  self_link = var.subnetwork
}

resource "google_compute_network" "this" {
  count = local.create_network ? 1 : 0

  project                 = var.project_id
  name                    = var.name
  description             = "Tersect Browser ${var.name}"
  auto_create_subnetworks = false

  depends_on = [google_project_service.this]
}

resource "google_compute_subnetwork" "this" {
  count = local.create_network ? 1 : 0

  project                  = var.project_id
  name                     = var.name
  region                   = var.region
  network                  = google_compute_network.this[0].id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

# --- Firewall ----------------------------------------------------------------
# The rules apply to instances that carry the deployment's network tag.

resource "google_compute_firewall" "https" {
  project     = var.project_id
  name        = "${var.name}-https"
  description = "Tersect Browser ${var.name}: HTTPS"
  network     = local.network
  direction   = "INGRESS"

  source_ranges = var.allowed_cidrs
  target_tags   = [var.name]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
}

# Port 80 only redirects to HTTPS. With a domain it must be reachable by the
# certificate authority (ACME HTTP-01), so it is open to everyone; the proxy
# still applies the allowlist to the site itself.
resource "google_compute_firewall" "http" {
  project     = var.project_id
  name        = "${var.name}-http"
  description = local.has_domain ? "Tersect Browser ${var.name}: certificate validation and redirect" : "Tersect Browser ${var.name}: redirect to HTTPS"
  network     = local.network
  direction   = "INGRESS"

  source_ranges = local.has_domain ? ["0.0.0.0/0"] : var.allowed_cidrs
  target_tags   = [var.name]

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

# SSH from Identity-Aware Proxy only; who may use it is decided by IAM
# (roles/iap.tunnelResourceAccessor and OS Login), not by keys on the machine.
resource "google_compute_firewall" "iap_ssh" {
  count = var.enable_iap_ssh ? 1 : 0

  project     = var.project_id
  name        = "${var.name}-iap-ssh"
  description = "Tersect Browser ${var.name}: SSH through Identity-Aware Proxy"
  network     = local.network
  direction   = "INGRESS"

  source_ranges = ["35.235.240.0/20"] # Google's published IAP forwarding range
  target_tags   = [var.name]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
