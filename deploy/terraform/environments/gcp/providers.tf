provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  default_labels = merge(var.labels, {
    application = "tersect-browser"
    managed-by  = "terraform"
  })
}
