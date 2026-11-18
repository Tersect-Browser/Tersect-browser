# Two secrets. The instance's service account can read the first one only.
#
#   <name>-config-bundle         everything beside the compose file, including
#                                .env with the database passwords
#   <name>-basic-auth-password   the login password in clear, for operators
#                                (the bundle holds only its bcrypt hash)

resource "google_secret_manager_secret" "bundle" {
  project   = var.project_id
  secret_id = "${var.name}-config-bundle"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "bundle" {
  secret      = google_secret_manager_secret.bundle.id
  secret_data = var.bundle

  lifecycle {
    # The instance reads "latest": there must always be one.
    create_before_destroy = true
  }
}

resource "google_secret_manager_secret" "password" {
  project   = var.project_id
  secret_id = "${var.name}-basic-auth-password"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "password" {
  secret      = google_secret_manager_secret.password.id
  secret_data = var.basic_auth_password

  lifecycle {
    create_before_destroy = true
  }
}
