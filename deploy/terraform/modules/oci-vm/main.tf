# One Oracle Cloud compute instance that runs the Tersect Browser stack with
# Docker Compose. The defaults fit the Always Free allowance (an Ampere A1
# instance with 4 OCPUs and 24 GB, 200 GB of block storage). The resources are
# split by concern:
#
#   network.tf    VCN, subnet, internet gateway (unless given), security group
#   iam.tf        dynamic group and policy: read the bundle, pull images
#   registry.tf   Container Registry repositories
#   config.tf     the configuration bundle, in a private bucket
#   compute.tf    instance, data volume, reserved address
#   backup.tf     daily backups of the data volume

locals {
  compartment_id = coalesce(var.compartment_ocid, var.tenancy_ocid)

  tags = merge(var.tags, {
    "tersect-deployment" = var.name
  })

  has_domain = var.domain_name != null
}

# Object Storage and the Container Registry both sit under this name.
data "oci_objectstorage_namespace" "this" {
  compartment_id = local.compartment_id
}

data "oci_identity_availability_domains" "this" {
  count = var.availability_domain == null ? 1 : 0

  compartment_id = var.tenancy_ocid
}

locals {
  namespace = data.oci_objectstorage_namespace.this.namespace

  availability_domain = (
    var.availability_domain != null
    ? var.availability_domain
    : data.oci_identity_availability_domains.this[0].availability_domains[0].name
  )
}
