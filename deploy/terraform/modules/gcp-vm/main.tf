# One Compute Engine instance that runs the Tersect Browser stack with Docker
# Compose. The resources are split by concern:
#
#   network.tf    network and subnetwork (unless given), firewall rules
#   iam.tf        service account: pull images, read one secret, write logs
#   registry.tf   Artifact Registry repository
#   secrets.tf    the configuration bundle and the login password
#   compute.tf    instance, data disk, static address, DNS record
#   backup.tf     daily snapshots of the data disk

locals {
  labels = merge(var.labels, {
    tersect-deployment = var.name
  })

  machine_type = var.enable_assistant ? var.assistant_machine_type : var.machine_type
  gpu_count    = var.enable_assistant ? var.gpu_count : 0
  has_domain   = var.domain_name != null

  apis = var.enable_apis ? toset(concat(
    [
      "artifactregistry.googleapis.com",
      "compute.googleapis.com",
      "iam.googleapis.com",
      "iap.googleapis.com",
      "secretmanager.googleapis.com",
    ],
    var.dns_managed_zone != null ? ["dns.googleapis.com"] : [],
  )) : toset([])
}

resource "google_project_service" "this" {
  for_each = local.apis

  project = var.project_id
  service = each.value

  # Other things in the project may use the same APIs.
  disable_on_destroy = false
}
