locals {
  registry_host = "${var.region}.ocir.io"
  registry      = var.create_registry ? "${local.registry_host}/${local.namespace}/${var.name}" : null
}

# Private repositories <name>/web, <name>/backend and <name>/pipeline. Created
# here so that they land in this compartment; a push to a repository that
# does not exist would create it in the tenancy's root compartment.
resource "oci_artifacts_container_repository" "this" {
  for_each = var.create_registry ? toset(["web", "backend", "pipeline"]) : toset([])

  compartment_id = local.compartment_id
  display_name   = "${var.name}/${each.key}"
  is_public      = false
  freeform_tags  = local.tags
}
