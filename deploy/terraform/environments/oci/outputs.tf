output "url" {
  description = "Address of the site."
  value       = module.config.url
}

output "public_ip" {
  description = "Public IP address. With a domain, point an A record at it."
  value       = module.vm.public_ip
}

output "username" {
  description = "User name of the shared login."
  value       = module.config.basic_auth_username
}

output "password" {
  description = "Password of the shared login. Read it with: terraform output -raw password"
  value       = module.config.basic_auth_password
  sensitive   = true
}

output "connect_command" {
  description = "Opens a shell on the machine, when SSH is set up."
  value       = module.vm.connect_command
}

output "registry" {
  description = "Where to push the images: deploy/scripts/push-images.sh --platform linux/arm64 <registry> <tag>"
  value       = module.vm.registry
}

output "registry_login" {
  description = "Logs Docker in to the registry before a push. The password it asks for is an auth token of your user (Profile menu, My profile, Auth tokens)."
  value       = "docker login ${module.vm.registry_host} --username '${module.vm.namespace}/<your user name>'"
}

output "image_tag" {
  description = "The release the machine is told to run."
  value       = var.image_tag
}

output "instance_id" {
  description = "OCID of the compute instance."
  value       = module.vm.instance_id
}

output "data_volume_id" {
  description = "OCID of the data volume (backups are taken of this)."
  value       = module.vm.data_volume_id
}

output "self_signed_certificate" {
  description = "True when there is no domain: browsers show a certificate warning."
  value       = module.config.uses_self_signed_certificate
}
