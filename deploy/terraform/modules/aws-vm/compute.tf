# --- Image -------------------------------------------------------------------

data "aws_ssm_parameter" "ubuntu" {
  count = var.ami_id == null ? 1 : 0

  # Published by Canonical; always the current Ubuntu 24.04 LTS image.
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

locals {
  ami_id = var.ami_id != null ? var.ami_id : data.aws_ssm_parameter.ubuntu[0].insecure_value
}

# --- Boot script -------------------------------------------------------------

module "bootstrap" {
  source = "../vm-bootstrap"

  name                = var.name
  config_poll_minutes = var.config_poll_minutes
  cloud_hooks         = file("${path.module}/files/cloud.sh")

  # Nitro instances show EBS volumes as NVMe devices in no fixed order; the
  # by-id link carries the volume id. /dev/xvdf is the name on older types.
  data_device_candidates = [
    "/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${replace(aws_ebs_volume.data.id, "-", "")}",
    "/dev/xvdf",
  ]

  cloud_settings = {
    REGION         = local.region
    BUNDLE_ID      = aws_secretsmanager_secret.bundle.arn
    REGISTRY_HOSTS = var.create_registry ? local.registry_host : ""
  }
}

# --- Instance ----------------------------------------------------------------

resource "aws_instance" "this" {
  ami                    = local.ami_id
  instance_type          = local.instance_type
  subnet_id              = local.subnet_id
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  ebs_optimized          = true

  # Internet access during the first minute, before the Elastic IP is attached.
  associate_public_ip_address = true

  # No secrets in here: names only. cloud-init unpacks gzip by itself.
  user_data_base64            = base64gzip(module.bootstrap.script)
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 1          # containers cannot reach the instance role
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    kms_key_id            = var.kms_key_arn
    delete_on_termination = true

    tags = merge(local.tags, { Name = "${var.name}-root" })
  }

  tags = merge(local.tags, { Name = var.name })

  lifecycle {
    # A newer Ubuntu image must not replace a running machine.
    ignore_changes = [ami]

    # A new data volume (a restore) needs a fresh first boot: the boot script
    # names the volume. The changed user data already forces this; stated
    # here so it does not depend on that.
    replace_triggered_by = [aws_ebs_volume.data.id]
  }

  depends_on = [
    aws_secretsmanager_secret_version.bundle,
    aws_iam_role_policy.instance,
    aws_iam_role_policy_attachment.ssm,
    aws_route.internet,
  ]
}

# --- Data volume -------------------------------------------------------------
# Separate from the instance, so it outlives every replacement of it.

resource "aws_ebs_volume" "data" {
  availability_zone = local.availability_zone
  type              = var.data_volume_type
  size              = var.data_volume_size_gb
  encrypted         = true
  kms_key_id        = var.kms_key_arn
  snapshot_id       = var.data_volume_snapshot_id

  tags = merge(local.tags, {
    Name                  = "${var.name}-data"
    "tersect:snapshot-of" = var.name
    "tersect:mount-point" = "/data"
  })

  lifecycle {
    # Read at creation only: removing the variable later must not wipe the
    # volume. To restore, replace this resource on purpose (see the README).
    ignore_changes = [snapshot_id]

    # To make "terraform destroy" refuse to delete the data, uncomment:
    # prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.this.id

  # Stop the instance (a clean shutdown of the databases) before the volume
  # is taken away from it.
  stop_instance_before_detaching = true
}

# --- Address -----------------------------------------------------------------

resource "aws_eip" "this" {
  domain = "vpc"

  tags = merge(local.tags, { Name = var.name })
}

resource "aws_eip_association" "this" {
  allocation_id = aws_eip.this.id
  instance_id   = aws_instance.this.id
}

resource "aws_route53_record" "this" {
  count = var.route53_zone_id != null ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.this.public_ip]
}
