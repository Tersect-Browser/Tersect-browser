# Checks the whole configuration without a Google Cloud project: the provider
# is mocked, nothing is created. Needs Terraform or OpenTofu 1.7 or newer.
#
#   tofu test        (or: terraform test)

mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      email  = "tersect-vm@my-project.iam.gserviceaccount.com"
      member = "serviceAccount:tersect-vm@my-project.iam.gserviceaccount.com"
    }
  }

  mock_resource "google_compute_address" {
    defaults = {
      address = "203.0.113.10"
    }
  }
}

variables {
  project_id = "my-project"
  region     = "europe-west2"
  zone       = "europe-west2-b"
  image_tag  = "1.0.0"
}

run "defaults_serve_on_the_ip_address" {
  command = apply

  assert {
    condition     = output.url == "https://203.0.113.10/TersectBrowserGP/"
    error_message = "Without a domain the site is served on the static address."
  }

  assert {
    condition     = output.self_signed_certificate
    error_message = "Without a domain the certificate is self-signed."
  }

  assert {
    condition     = output.registry == "europe-west2-docker.pkg.dev/my-project/tersect"
    error_message = "The registry prefix is the Artifact Registry host, the project and the deployment name."
  }

  assert {
    condition     = length(output.password) == 24 && can(regex("^[A-Za-z0-9]+$", output.password))
    error_message = "A password of letters and digits is generated."
  }
}

run "domain_allowlist_and_assistant" {
  command = apply

  variables {
    domain_name         = "tersect.example.org"
    dns_managed_zone    = "example-org"
    allowed_cidrs       = ["203.0.113.0/24"]
    basic_auth_password = "a-supplied-password"
    enable_assistant    = true
  }

  assert {
    condition     = output.url == "https://tersect.example.org/TersectBrowserGP/"
    error_message = "With a domain the site is served on it."
  }

  assert {
    condition     = nonsensitive(output.password) == "a-supplied-password"
    error_message = "A supplied password is used as it is."
  }
}

run "rejects_an_invalid_network" {
  command = plan

  variables {
    allowed_cidrs = ["203.0.113.0"]
  }

  expect_failures = [var.allowed_cidrs]
}
