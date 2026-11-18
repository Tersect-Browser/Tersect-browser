# Checks the whole configuration without an Oracle Cloud account: the provider
# is mocked, nothing is created. Needs Terraform or OpenTofu 1.7 or newer.
#
#   tofu test        (or: terraform test)

mock_provider "oci" {
  mock_data "oci_objectstorage_namespace" {
    defaults = {
      namespace = "mynamespace"
    }
  }

  mock_data "oci_core_private_ips" {
    defaults = {
      # OpenTofu wants every attribute of a mocked object; Terraform only id.
      private_ips = [{
        id                          = "ocid1.privateip.oc1.uk-london-1.aaaa"
        availability_domain         = null
        cidr_prefix_length          = null
        compartment_id              = null
        defined_tags                = null
        display_name                = null
        freeform_tags               = null
        hostname_label              = null
        ip_address                  = null
        ip_state                    = null
        ipv4subnet_cidr_at_creation = null
        is_primary                  = null
        is_reserved                 = null
        lifetime                    = null
        route_table_id              = null
        subnet_id                   = null
        time_created                = null
        vlan_id                     = null
        vnic_id                     = null
      }]
    }
  }

  mock_resource "oci_core_public_ip" {
    defaults = {
      ip_address = "203.0.113.10"
    }
  }
}

mock_provider "oci" {
  alias = "home"
}

# The availability domain and the image are given, so that the mocked provider
# is not asked to list them.
variables {
  tenancy_ocid        = "ocid1.tenancy.oc1..aaaa"
  region              = "uk-london-1"
  availability_domain = "Uocm:UK-LONDON-1-AD-1"
  image_id            = "ocid1.image.oc1.uk-london-1.aaaa"
  image_tag           = "1.0.0"
}

run "defaults_serve_on_the_ip_address" {
  command = apply

  assert {
    condition     = output.url == "https://203.0.113.10/TersectBrowserGP/"
    error_message = "Without a domain the site is served on the reserved address."
  }

  assert {
    condition     = output.self_signed_certificate
    error_message = "Without a domain the certificate is self-signed."
  }

  assert {
    condition     = output.registry == "uk-london-1.ocir.io/mynamespace/tersect"
    error_message = "The registry prefix is the regional registry host, the namespace and the deployment name."
  }

  assert {
    condition     = length(output.password) == 24 && can(regex("^[A-Za-z0-9]+$", output.password))
    error_message = "A password of letters and digits is generated."
  }

  assert {
    condition     = startswith(output.connect_command, "SSH is closed")
    error_message = "SSH is closed unless a key and networks are given."
  }
}

run "domain_allowlist_and_ssh" {
  command = apply

  variables {
    domain_name         = "tersect.example.org"
    allowed_cidrs       = ["203.0.113.0/24"]
    basic_auth_password = "a-supplied-password"
    ssh_public_key      = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample you@laptop"
    ssh_allowed_cidrs   = ["198.51.100.7/32"]
  }

  assert {
    condition     = output.url == "https://tersect.example.org/TersectBrowserGP/"
    error_message = "With a domain the site is served on it."
  }

  assert {
    condition     = nonsensitive(output.password) == "a-supplied-password"
    error_message = "A supplied password is used as it is."
  }

  assert {
    condition     = output.connect_command == "ssh ubuntu@203.0.113.10"
    error_message = "With a key and networks the command to log in is given."
  }
}

run "follows_images_from_another_registry" {
  command = apply

  variables {
    image_tag     = null
    follow_images = true
    images = {
      web      = "ghcr.io/tersect-browser/tersect-web:develop"
      backend  = "ghcr.io/tersect-browser/tersect-backend:develop"
      pipeline = "ghcr.io/tersect-browser/tersect-pipeline:develop"
    }
  }

  assert {
    condition     = output.registry == null
    error_message = "With images from another registry none is created."
  }
}

run "public_site" {
  command = apply

  variables {
    public_site         = true
    basic_auth_password = "it's a pass$word"
  }

  assert {
    condition     = output.public_site
    error_message = "A public site says so."
  }
}

run "rejects_no_images_at_all" {
  command = plan

  variables {
    image_tag = null
  }

  expect_failures = [var.image_tag]
}

run "rejects_an_invalid_network" {
  command = plan

  variables {
    allowed_cidrs = ["203.0.113.0"]
  }

  expect_failures = [var.allowed_cidrs]
}

run "rejects_ssh_networks_without_a_key" {
  command = plan

  variables {
    ssh_allowed_cidrs = ["198.51.100.7/32"]
  }

  expect_failures = [var.ssh_allowed_cidrs]
}
