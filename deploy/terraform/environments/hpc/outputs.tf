output "url" {
  description = "Address of the site once the SSH tunnel is open."
  value       = module.hpc.url
}

output "status_command" {
  description = "Run this to see where the job runs and the exact SSH tunnel command for that node."
  value       = module.hpc.status_command
}

output "tunnel_command" {
  description = "The SSH tunnel to open from your own computer; replace NODE with the node name from status_command."
  value       = module.hpc.tunnel_command
}

output "basic_auth_username" {
  description = "User name of the shared login."
  value       = module.hpc.basic_auth_username
}

output "basic_auth_password" {
  description = "Password of the shared login (terraform output -raw basic_auth_password)."
  value       = module.hpc.basic_auth_password
  sensitive   = true
}

output "deploy_dir" {
  description = "The deployment directory on the cluster."
  value       = module.hpc.deploy_dir
}

output "data_dir" {
  description = "Where the data lives on the cluster. Never removed by Terraform."
  value       = module.hpc.data_dir
}

output "assistant" {
  description = "How the dataset assistant is set up."
  value       = module.hpc.assistant
}

output "sbatch_header" {
  description = "The #SBATCH lines of the job, for checking against the cluster's rules."
  value       = module.hpc.sbatch_header
}
