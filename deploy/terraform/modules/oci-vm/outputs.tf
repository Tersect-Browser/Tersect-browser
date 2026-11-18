output "public_ip" {
  description = "The reserved address of the deployment. It stays the same when the instance is replaced."
  value       = oci_core_public_ip.this.ip_address
}

output "instance_id" {
  description = "OCID of the compute instance."
  value       = oci_core_instance.this.id
}

output "connect_command" {
  description = "Opens a shell on the instance, or says what is missing for one."
  value = (
    var.ssh_public_key != null && length(var.ssh_allowed_cidrs) > 0
    ? "ssh ubuntu@${oci_core_public_ip.this.ip_address}"
    : "SSH is closed: set ssh_public_key and ssh_allowed_cidrs, or use a console connection of the instance."
  )
}

output "registry" {
  description = "Registry prefix for deploy/scripts/push-images.sh (the images are <registry>/web, /backend and /pipeline), or null when create_registry is false."
  value       = local.registry
}

output "registry_host" {
  description = "Host to give to docker login before pushing."
  value       = local.registry_host
}

output "namespace" {
  description = "Object Storage namespace of the tenancy: the first part of the registry path and of the registry user name (<namespace>/<user>)."
  value       = local.namespace
}

output "data_volume_id" {
  description = "OCID of the data volume."
  value       = oci_core_volume.data.id
}

output "bundle_bucket" {
  description = "Name of the bucket that holds the configuration bundle."
  value       = oci_objectstorage_bucket.config.name
}

output "dynamic_group" {
  description = "Name of the instance's dynamic group, to grant it further access (for example read access to a bucket of input files)."
  value       = oci_identity_dynamic_group.instance.name
}

output "bootstrap_script_sha256" {
  description = "Hash of the boot script. A change replaces the instance."
  value       = module.bootstrap.script_sha256
}
