# Daily snapshots of the data volume with Data Lifecycle Manager. Snapshots
# are taken while the machine runs (crash-consistent); MongoDB and ClickHouse
# both recover from that state with their journals.

data "aws_iam_policy_document" "assume_dlm" {
  count = var.enable_snapshots ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  count = var.enable_snapshots ? 1 : 0

  name_prefix        = "${var.name}-snapshots-"
  description        = "Tersect Browser ${var.name}: Data Lifecycle Manager"
  assume_role_policy = data.aws_iam_policy_document.assume_dlm[0].json

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "dlm" {
  count = var.enable_snapshots ? 1 : 0

  role       = aws_iam_role.dlm[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "data" {
  count = var.enable_snapshots ? 1 : 0

  description        = "Tersect Browser ${var.name} daily snapshot of the data volume"
  execution_role_arn = aws_iam_role.dlm[0].arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]

    target_tags = {
      "tersect:snapshot-of" = var.name
    }

    schedule {
      name      = "daily"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = [var.snapshot_time_utc]
      }

      retain_rule {
        count = var.snapshot_retention_days
      }

      tags_to_add = {
        "tersect:created-by" = "dlm"
      }
    }
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy_attachment.dlm]
}
