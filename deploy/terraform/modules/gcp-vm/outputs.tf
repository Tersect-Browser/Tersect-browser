output "public_ip" {
  description = "The static address of the deployment. It stays the same when the instance is replaced."
  value       = google_compute_address.this.address
}

output "instance_name" {
  description = "Name of the Compute Engine instance."
  value       = google_compute_instance.this.name
}

output "connect_command" {
  description = "Opens a shell on the instance through Identity-Aware Proxy (needs roles/iap.tunnelResourceAccessor and roles/compute.osAdminLogin)."
  value       = "gcloud compute ssh ${google_compute_instance.this.name} --project ${var.project_id} --zone ${var.zone} --tunnel-through-iap"
}

output "registry" {
  description = "Registry prefix for deploy/scripts/push-images.sh (the images are <registry>/web, /backend and /pipeline), or null when create_registry is false."
  value       = local.registry
}

output "data_disk_name" {
  description = "Name of the data disk."
  value       = google_compute_disk.data.name
}

output "bundle_secret_id" {
  description = "Id of the secret that holds the configuration bundle."
  value       = google_secret_manager_secret.bundle.secret_id
}

output "password_secret_id" {
  description = "Id of the secret that holds the login password."
  value       = google_secret_manager_secret.password.secret_id
}

output "password_command" {
  description = "Prints the login password."
  value       = "gcloud secrets versions access latest --project ${var.project_id} --secret ${google_secret_manager_secret.password.secret_id}"
}

output "service_account_email" {
  description = "Email of the instance's service account, to grant it further access (for example read access to a bucket of input files)."
  value       = google_service_account.instance.email
}

output "network_tag" {
  description = "Network tag the firewall rules apply to."
  value       = var.name
}

output "bootstrap_script_sha256" {
  description = "Hash of the boot script. A change takes effect at the next boot of the instance."
  value       = module.bootstrap.script_sha256
}
