locals {
  image_names   = var.create_registry ? toset(["web", "backend", "pipeline"]) : toset([])
  registry_host = "${local.account_id}.dkr.ecr.${local.region}.amazonaws.com"
}

resource "aws_ecr_repository" "this" {
  for_each = local.image_names

  name                 = "${var.name}/${each.key}"
  image_tag_mutability = var.registry_immutable_tags ? "IMMUTABLE" : "MUTABLE"
  force_delete         = var.registry_force_delete

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last ${var.registry_keep_images} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.registry_keep_images
      }
      action = { type = "expire" }
    }]
  })
}
