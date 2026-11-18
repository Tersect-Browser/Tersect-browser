# The configuration bundle: everything beside the compose file, including .env
# with the database passwords. It is an object in a private bucket; the policy
# in iam.tf lets the instance read this bucket and nothing else. Object
# Storage encrypts at rest.
#
# A bucket, not a Vault secret: a secret holds 25 KB and the bundle is larger.

locals {
  bundle_object = "bundle.json"
}

resource "oci_objectstorage_bucket" "config" {
  compartment_id = local.compartment_id
  namespace      = local.namespace
  name           = "${var.name}-config"
  access_type    = "NoPublicAccess"
  freeform_tags  = local.tags
}

resource "oci_objectstorage_object" "bundle" {
  namespace    = local.namespace
  bucket       = oci_objectstorage_bucket.config.name
  object       = local.bundle_object
  content      = var.bundle
  content_type = "application/json"
}
