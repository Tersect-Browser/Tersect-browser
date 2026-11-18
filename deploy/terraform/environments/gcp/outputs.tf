output "url" {
  description = "Address of the site."
  value       = module.config.url
}

output "public_ip" {
  description = "Public IP address. With a domain managed outside Cloud DNS, point an A record at it."
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

output "password_command" {
  description = "Prints the password from Secret Manager, for operators without access to the state."
  value       = module.vm.password_command
}

output "connect_command" {
  description = "Opens a shell on the machine (SSH through Identity-Aware Proxy; port 22 is closed to the internet)."
  value       = module.vm.connect_command
}

output "registry" {
  description = "Where to push the images: deploy/scripts/push-images.sh <registry> <tag>"
  value       = module.vm.registry
}

output "image_tag" {
  description = "The release the machine is told to run."
  value       = var.image_tag
}

output "instance_name" {
  description = "Name of the Compute Engine instance."
  value       = module.vm.instance_name
}

output "data_disk_name" {
  description = "Name of the data disk (snapshots are taken of this)."
  value       = module.vm.data_disk_name
}

output "self_signed_certificate" {
  description = "True when there is no domain: browsers show a certificate warning."
  value       = module.config.uses_self_signed_certificate
}
