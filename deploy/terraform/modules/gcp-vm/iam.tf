# The instance's service account. It can: pull from this deployment's
# repository, read this deployment's configuration bundle, and write logs and
# metrics. Nothing else, although the instance has the cloud-platform scope:
# IAM decides, not scopes.

resource "google_service_account" "instance" {
  project      = var.project_id
  account_id   = "${var.name}-vm"
  display_name = "Tersect Browser ${var.name}: instance"

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_iam_member" "bundle" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bundle.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.instance.member
}

resource "google_artifact_registry_repository_iam_member" "pull" {
  count = var.create_registry ? 1 : 0

  project    = var.project_id
  location   = google_artifact_registry_repository.this[0].location
  repository = google_artifact_registry_repository.this[0].name
  role       = "roles/artifactregistry.reader"
  member     = google_service_account.instance.member
}

resource "google_project_iam_member" "observability" {
  for_each = toset(["roles/logging.logWriter", "roles/monitoring.metricWriter"])

  project = var.project_id
  role    = each.value
  member  = google_service_account.instance.member
}
