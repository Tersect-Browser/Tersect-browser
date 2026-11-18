output "bundle" {
  description = "The configuration bundle: a JSON document with every file that sits beside the compose file (.env, docker-compose.yml, site.d/, mongo-init.js, clickhouse/). Store it in the cloud's secret store; the machine fetches and unpacks it."
  value       = local.bundle
  sensitive   = true
}

output "files" {
  description = "The same files as a map of path => { mode, content }, for inspection or other delivery methods."
  value       = local.files
  sensitive   = true
}

output "env_file" {
  description = "Content of the .env file."
  value       = local.env_file
  sensitive   = true
}

output "url" {
  description = "Address of the site."
  value       = "${local.public_url}/TersectBrowserGP/"
}

output "site_address" {
  description = "Domain or IP address the proxy serves."
  value       = local.site_address
}

output "uses_self_signed_certificate" {
  description = "True when no domain is set: browsers warn about the certificate."
  value       = !local.has_domain
}

output "basic_auth_username" {
  description = "User name of the shared login."
  value       = var.basic_auth_username
}

output "basic_auth_password" {
  description = "Password of the shared login (generated unless supplied)."
  value       = local.basic_auth_password
  sensitive   = true
}

output "public_site" {
  description = "True when anyone may browse and the login only guards dataset management."
  value       = var.public_site
}

output "access_restricted" {
  description = "True when allowed_cidrs limits who can connect."
  value       = local.restricted
}
