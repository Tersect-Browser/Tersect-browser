# What the instance may do with its own identity (an "instance principal"):
# read this deployment's configuration bundle and pull from the registry of
# its compartment. Nothing else.
#
# Dynamic groups belong to the tenancy, not to a compartment, and can only be
# changed in the home region: hence tenancy_ocid and the oci.home provider.
# Creating them needs the rights of a tenancy administrator.

resource "oci_identity_dynamic_group" "instance" {
  provider = oci.home

  compartment_id = var.tenancy_ocid
  name           = "${var.name}-instance"
  description    = "Tersect Browser ${var.name}: the instance"
  matching_rule  = "instance.id = '${oci_core_instance.this.id}'"
  freeform_tags  = local.tags
}

resource "oci_identity_policy" "instance" {
  provider = oci.home

  compartment_id = local.compartment_id
  name           = "${var.name}-instance"
  description    = "Tersect Browser ${var.name}: what the instance may read"
  freeform_tags  = local.tags

  statements = concat(
    [
      "Allow dynamic-group ${oci_identity_dynamic_group.instance.name} to read objects in compartment id ${local.compartment_id} where target.bucket.name = '${oci_objectstorage_bucket.config.name}'",
    ],
    var.create_registry ? [
      "Allow dynamic-group ${oci_identity_dynamic_group.instance.name} to read repos in compartment id ${local.compartment_id}",
    ] : [],
  )
}
