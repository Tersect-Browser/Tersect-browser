# One EC2 instance that runs the Tersect Browser stack with Docker Compose.
# The resources are split by concern:
#
#   network.tf    VPC and subnet (unless given), security group
#   iam.tf        instance role: Session Manager, pull images, read one secret
#   registry.tf   ECR repositories
#   secrets.tf    the configuration bundle and the login password
#   compute.tf    instance, data volume, Elastic IP, DNS record
#   backup.tf     daily snapshots of the data volume

data "aws_region" "current" {}
data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  tags = merge(var.tags, {
    "tersect:deployment" = var.name
  })

  region        = data.aws_region.current.region
  account_id    = data.aws_caller_identity.current.account_id
  partition     = data.aws_partition.current.partition
  instance_type = var.enable_assistant ? var.assistant_instance_type : var.instance_type
  has_domain    = var.domain_name != null
}
