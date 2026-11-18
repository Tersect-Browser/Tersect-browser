output "script" {
  description = "The boot script (bash). Pass it as EC2 user data or as the startup-script metadata of a Compute Engine instance. It contains no secrets."
  value       = local.script
}

output "script_sha256" {
  description = "Hash of the script, to see at a glance whether it changed."
  value       = sha256(local.script)
}
