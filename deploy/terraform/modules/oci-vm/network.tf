locals {
  create_network = var.subnet_id == null
  subnet_id      = local.create_network ? oci_core_subnet.this[0].id : var.subnet_id
  vcn_id         = local.create_network ? oci_core_vcn.this[0].id : data.oci_core_subnet.existing[0].vcn_id
}

data "oci_core_subnet" "existing" {
  count = local.create_network ? 0 : 1

  subnet_id = var.subnet_id
}

resource "oci_core_vcn" "this" {
  count = local.create_network ? 1 : 0

  compartment_id = local.compartment_id
  display_name   = var.name
  cidr_blocks    = [var.vcn_cidr]
  freeform_tags  = local.tags
}

resource "oci_core_internet_gateway" "this" {
  count = local.create_network ? 1 : 0

  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this[0].id
  display_name   = var.name
  freeform_tags  = local.tags
}

resource "oci_core_route_table" "this" {
  count = local.create_network ? 1 : 0

  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this[0].id
  display_name   = var.name
  freeform_tags  = local.tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.this[0].id
  }
}

# A security list with no rules. Oracle Cloud adds the rules of a subnet's
# security lists to those of the security group below, and the list a VCN
# comes with opens port 22 to the world; this one leaves the group in charge.
resource "oci_core_security_list" "closed" {
  count = local.create_network ? 1 : 0

  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this[0].id
  display_name   = "${var.name}-closed"
  freeform_tags  = local.tags
}

resource "oci_core_subnet" "this" {
  count = local.create_network ? 1 : 0

  compartment_id    = local.compartment_id
  vcn_id            = oci_core_vcn.this[0].id
  display_name      = var.name
  cidr_block        = var.subnet_cidr
  route_table_id    = oci_core_route_table.this[0].id
  security_list_ids = [oci_core_security_list.closed[0].id]
  freeform_tags     = local.tags
}

# --- Firewall ----------------------------------------------------------------
# The rules apply to the instance's network interface.

resource "oci_core_network_security_group" "this" {
  compartment_id = local.compartment_id
  vcn_id         = local.vcn_id
  display_name   = var.name
  freeform_tags  = local.tags
}

resource "oci_core_network_security_group_security_rule" "egress" {
  network_security_group_id = oci_core_network_security_group.this.id
  description               = "Tersect Browser ${var.name}: outbound (images, packages, dataset downloads)"
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "https" {
  for_each = toset(var.allowed_cidrs)

  network_security_group_id = oci_core_network_security_group.this.id
  description               = "Tersect Browser ${var.name}: HTTPS"
  direction                 = "INGRESS"
  protocol                  = "6" # TCP
  source                    = each.value
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

# Port 80 only redirects to HTTPS. With a domain it must be reachable by the
# certificate authority (ACME HTTP-01), so it is open to everyone; the proxy
# still applies the allowlist to the site itself.
resource "oci_core_network_security_group_security_rule" "http" {
  for_each = toset(local.has_domain ? ["0.0.0.0/0"] : var.allowed_cidrs)

  network_security_group_id = oci_core_network_security_group.this.id
  description               = local.has_domain ? "Tersect Browser ${var.name}: certificate validation and redirect" : "Tersect Browser ${var.name}: redirect to HTTPS"
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = each.value
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

# SSH is closed unless networks are named for it.
resource "oci_core_network_security_group_security_rule" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  network_security_group_id = oci_core_network_security_group.this.id
  description               = "Tersect Browser ${var.name}: SSH for operators"
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = each.value
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}
