# Credentials come from the OCI configuration file (~/.oci/config), as written
# by "oci setup config" or by the console when you add an API key.

provider "oci" {
  region              = var.region
  config_file_profile = var.config_file_profile
}

# Dynamic groups and policies can only be changed in the tenancy's home region.
provider "oci" {
  alias               = "home"
  region              = coalesce(var.home_region, var.region)
  config_file_profile = var.config_file_profile
}
