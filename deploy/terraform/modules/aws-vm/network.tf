locals {
  create_network = var.subnet_id == null

  vpc_id            = local.create_network ? aws_vpc.this[0].id : data.aws_subnet.existing[0].vpc_id
  subnet_id         = local.create_network ? aws_subnet.public[0].id : var.subnet_id
  availability_zone = local.create_network ? aws_subnet.public[0].availability_zone : data.aws_subnet.existing[0].availability_zone
}

data "aws_subnet" "existing" {
  count = local.create_network ? 0 : 1
  id    = var.subnet_id
}

data "aws_availability_zones" "available" {
  count = local.create_network ? 1 : 0
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

resource "aws_vpc" "this" {
  count = local.create_network ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.tags, { Name = var.name })
}

resource "aws_internet_gateway" "this" {
  count = local.create_network ? 1 : 0

  vpc_id = aws_vpc.this[0].id
  tags   = merge(local.tags, { Name = var.name })
}

resource "aws_subnet" "public" {
  count = local.create_network ? 1 : 0

  vpc_id                  = aws_vpc.this[0].id
  cidr_block              = var.vpc_cidr
  availability_zone       = coalesce(var.availability_zone, data.aws_availability_zones.available[0].names[0])
  map_public_ip_on_launch = false

  tags = merge(local.tags, { Name = "${var.name}-public" })
}

resource "aws_route_table" "public" {
  count = local.create_network ? 1 : 0

  vpc_id = aws_vpc.this[0].id
  tags   = merge(local.tags, { Name = "${var.name}-public" })
}

resource "aws_route" "internet" {
  count = local.create_network ? 1 : 0

  route_table_id         = aws_route_table.public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this[0].id
}

resource "aws_route_table_association" "public" {
  count = local.create_network ? 1 : 0

  subnet_id      = aws_subnet.public[0].id
  route_table_id = aws_route_table.public[0].id
}

# --- Security group ----------------------------------------------------------
# No SSH: administration goes through Session Manager, which needs no inbound
# port at all.

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-"
  description = "Tersect Browser ${var.name}: HTTPS in, everything out"
  vpc_id      = local.vpc_id

  tags = merge(local.tags, { Name = var.name })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  for_each = toset(var.allowed_cidrs)

  security_group_id = aws_security_group.this.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value

  tags = local.tags
}

# Port 80 only redirects to HTTPS. With a domain it must be reachable by the
# certificate authority (ACME HTTP-01), so it is open to everyone; the proxy
# still applies the allowlist to the site itself.
resource "aws_vpc_security_group_ingress_rule" "http" {
  for_each = toset(local.has_domain ? ["0.0.0.0/0"] : var.allowed_cidrs)

  security_group_id = aws_security_group.this.id
  description       = local.has_domain ? "HTTP: certificate validation and redirect" : "HTTP: redirect to HTTPS"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = each.value

  tags = local.tags
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.this.id
  description       = "Packages, images, certificate authority, AWS APIs"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"

  tags = local.tags
}
