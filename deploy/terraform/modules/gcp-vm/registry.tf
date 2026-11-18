locals {
  registry_host = "${var.region}-docker.pkg.dev"
  registry      = var.create_registry ? "${local.registry_host}/${var.project_id}/${google_artifact_registry_repository.this[0].repository_id}" : null
}

resource "google_artifact_registry_repository" "this" {
  count = var.create_registry ? 1 : 0

  project       = var.project_id
  location      = var.region
  repository_id = var.name
  description   = "Tersect Browser ${var.name}: application images"
  format        = "DOCKER"
  labels        = local.labels

  # Delete versions older than 30 days, except the most recent ones.
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"

    condition {
      older_than = "30d"
    }
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.registry_keep_images
    }
  }

  depends_on = [google_project_service.this]
}
