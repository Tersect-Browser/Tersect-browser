output "public_ip" {
  description = "The Elastic IP of the deployment. It stays the same when the instance is replaced."
  value       = aws_eip.this.public_ip
}

output "instance_id" {
  description = "Id of the EC2 instance."
  value       = aws_instance.this.id
}

output "connect_command" {
  description = "Opens a shell on the instance through Session Manager (needs the AWS CLI and its Session Manager plugin)."
  value       = "aws ssm start-session --region ${local.region} --target ${aws_instance.this.id}"
}

output "registry" {
  description = "Registry prefix for deploy/scripts/push-images.sh (the images are <registry>/web, /backend and /pipeline), or null when create_registry is false."
  value       = var.create_registry ? "${local.registry_host}/${var.name}" : null
}

output "repository_urls" {
  description = "URL of each ECR repository, by image name (web, backend, pipeline). Empty when create_registry is false."
  value       = { for name, repository in aws_ecr_repository.this : name => repository.repository_url }
}

output "data_volume_id" {
  description = "Id of the data volume."
  value       = aws_ebs_volume.data.id
}

output "bundle_secret_arn" {
  description = "ARN of the secret that holds the configuration bundle."
  value       = aws_secretsmanager_secret.bundle.arn
}

output "password_secret_arn" {
  description = "ARN of the secret that holds the login password."
  value       = aws_secretsmanager_secret.password.arn
}

output "password_command" {
  description = "Prints the login password."
  value       = "aws secretsmanager get-secret-value --region ${local.region} --secret-id ${aws_secretsmanager_secret.password.name} --query SecretString --output text"
}

output "security_group_id" {
  description = "Id of the instance's security group."
  value       = aws_security_group.this.id
}

output "instance_role_name" {
  description = "Name of the instance role, to attach further policies (for example read access to a bucket of input files)."
  value       = aws_iam_role.instance.name
}

output "bootstrap_script_sha256" {
  description = "Hash of the boot script. The instance is replaced when it changes."
  value       = module.bootstrap.script_sha256
}
