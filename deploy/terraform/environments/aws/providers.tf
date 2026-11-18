provider "aws" {
  region = var.region

  default_tags {
    tags = merge(var.tags, {
      Application = "tersect-browser"
      ManagedBy   = "terraform"
    })
  }
}
