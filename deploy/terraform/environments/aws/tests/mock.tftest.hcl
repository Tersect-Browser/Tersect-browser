# Checks the whole configuration without an AWS account: the provider is
# mocked, nothing is created. Needs Terraform or OpenTofu 1.7 or newer.
#
#   tofu test        (or: terraform test)

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["eu-west-2a", "eu-west-2b"]
    }
  }

  mock_data "aws_region" {
    defaults = {
      region = "eu-west-2"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_eip" {
    defaults = {
      public_ip = "203.0.113.10"
    }
  }
}

variables {
  region    = "eu-west-2"
  image_tag = "1.0.0"
}

run "defaults_serve_on_the_ip_address" {
  command = apply

  assert {
    condition     = output.url == "https://203.0.113.10/TersectBrowserGP/"
    error_message = "Without a domain the site is served on the Elastic IP."
  }

  assert {
    condition     = output.self_signed_certificate
    error_message = "Without a domain the certificate is self-signed."
  }

  assert {
    condition     = output.registry == "123456789012.dkr.ecr.eu-west-2.amazonaws.com/tersect"
    error_message = "The registry prefix is the ECR host followed by the deployment name."
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
    route53_zone_id     = "Z0123456789ABCDEFGHIJ"
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
