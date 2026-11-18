terraform {
  required_version = ">= 1.6.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 9.0"

      # oci.home is the tenancy's home region: Oracle Cloud only accepts
      # changes to dynamic groups and policies there.
      configuration_aliases = [oci.home]
    }
  }
}
