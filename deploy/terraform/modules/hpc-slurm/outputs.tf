output "deploy_dir" {
  description = "The deployment directory on the cluster."
  value       = var.deploy_dir
}

output "data_dir" {
  description = "Where the data lives on the cluster. Never removed by Terraform."
  value       = local.data_dir
}

output "url" {
  description = "Address of the site once the SSH tunnel is open."
  value       = "${local.public_url}/TersectBrowserGP/"
}

output "status_command" {
  description = "Shows the job, the node it runs on and the exact SSH tunnel command for that node. Run it after apply and whenever the job has restarted (the node can change)."
  value       = "ssh${var.ssh_port == 22 ? "" : " -p ${var.ssh_port}"} ${local.ssh_login} ${local.stack_script} status"

  depends_on = [terraform_data.deployment]
}

output "tunnel_command" {
  description = "The SSH tunnel to open from your own computer, with NODE standing for the compute node the job runs on (status_command prints the command with the node filled in)."
  value = (
    var.bind_address == "127.0.0.1"
    ? "ssh -N -L ${var.tunnel_local_port}:127.0.0.1:${var.http_port} -J ${local.ssh_login}${var.ssh_port == 22 ? "" : ":${var.ssh_port}"} ${var.ssh_user}@NODE"
    : "ssh -N -L ${var.tunnel_local_port}:NODE:${var.http_port}${var.ssh_port == 22 ? "" : " -p ${var.ssh_port}"} ${local.ssh_login}"
  )
}

output "basic_auth_username" {
  description = "User name of the shared login."
  value       = var.basic_auth_username
}

output "basic_auth_password" {
  description = "Password of the shared login."
  value       = local.basic_auth_password
  sensitive   = true
}

output "assistant" {
  description = "How the dataset assistant is set up: off, an external model server, or Ollama inside the job."
  value       = !var.enable_assistant ? "off" : (local.run_ollama ? "ollama in the job (${var.assistant_model})" : "external: ${var.assistant_url}")
}

output "sbatch_header" {
  description = "The #SBATCH lines of the job as submitted, for checking against the cluster's rules."
  value       = local.sbatch_header
}
