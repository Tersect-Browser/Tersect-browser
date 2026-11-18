# Everything the machine needs to run the production stack
# (deploy/compose/docker-compose.yml), independent of the cloud: generated
# passwords, the .env file, the proxy's access-control snippets, and one
# "bundle" that carries all of it to the machine.

locals {
  compose_dir    = coalesce(var.compose_dir, "${path.module}/../../../compose")
  clickhouse_dir = coalesce(var.clickhouse_dir, "${path.module}/../../../../clickhouse")

  has_domain   = var.domain_name != null
  site_address = local.has_domain ? var.domain_name : var.public_ip
  public_url   = "https://${local.site_address}"

  # Empty: Caddy gets a certificate for the domain by itself. With only an IP
  # address there is no certificate authority to ask, so Caddy signs its own.
  tls_directive = (
    !local.has_domain ? "tls internal" :
    var.acme_email != null ? "tls ${var.acme_email}" : ""
  )

  restricted = !contains(var.allowed_cidrs, "0.0.0.0/0")
}

# --- Secrets -----------------------------------------------------------------
# Letters and digits only: the passwords go into connection URLs.

resource "random_password" "mongo_root" {
  length  = 32
  special = false
}

resource "random_password" "mongo_app" {
  length  = 32
  special = false
}

resource "random_password" "clickhouse_admin" {
  length  = 32
  special = false
}

resource "random_password" "clickhouse_reader" {
  length  = 32
  special = false
}

resource "random_password" "basic_auth" {
  length  = 24
  special = false
}

# bcrypt() salts differently on every evaluation, which would show a change in
# every plan. For a supplied password the hash is therefore computed once and
# kept, and only recomputed when the password itself changes. A generated
# password uses the hash the random provider stores with it.
resource "terraform_data" "supplied_password_hash" {
  count = var.basic_auth_password != null ? 1 : 0

  input            = bcrypt(var.basic_auth_password, 10)
  triggers_replace = sha256(var.basic_auth_password)

  lifecycle {
    ignore_changes = [input]
  }
}

locals {
  basic_auth_password = var.basic_auth_password != null ? var.basic_auth_password : random_password.basic_auth.result
  basic_auth_hash = (
    var.basic_auth_password != null
    ? terraform_data.supplied_password_hash[0].output
    : random_password.basic_auth.bcrypt_hash
  )
}

# --- Rendered files ----------------------------------------------------------

locals {
  env_file = templatefile("${path.module}/templates/env.tftpl", {
    name                       = var.name
    images                     = var.images
    site_address               = local.site_address
    public_url                 = local.public_url
    tls_directive              = local.tls_directive
    data_dir                   = var.data_dir
    database_name              = var.database_name
    mongo_username             = var.mongo_username
    mongo_password             = random_password.mongo_app.result
    mongo_root_password        = random_password.mongo_root.result
    clickhouse_admin_password  = random_password.clickhouse_admin.result
    clickhouse_reader_password = random_password.clickhouse_reader.result
    enable_assistant           = var.enable_assistant
    assistant_model            = var.assistant_model
    assistant_context_chars    = var.assistant_context_chars
    ollama_context_length      = var.ollama_context_length
  })

  auth_caddy = templatefile("${path.module}/templates/auth.caddy.tftpl", {
    username      = var.basic_auth_username
    password_hash = local.basic_auth_hash
    restricted    = local.restricted
    allowed_cidrs = var.allowed_cidrs
  })

  allowlist_caddy = templatefile("${path.module}/templates/allowlist.caddy.tftpl", {
    allowed_cidrs = var.allowed_cidrs
  })

  # With the low-memory settings switched off the compose file still mounts
  # the file, so it becomes an empty configuration.
  clickhouse_overrides = (
    var.clickhouse_low_memory
    ? file("${local.clickhouse_dir}/low-memory.xml")
    : "<!-- ClickHouse defaults (clickhouse_low_memory = false). -->\n<clickhouse>\n</clickhouse>\n"
  )

  # path (relative to the directory of the compose file) => content and mode
  files = merge(
    {
      ".env"                      = { mode = "0600", content = local.env_file }
      "docker-compose.yml"        = { mode = "0644", content = file("${local.compose_dir}/docker-compose.yml") }
      "mongo-init.js"             = { mode = "0644", content = file("${local.compose_dir}/mongo-init.js") }
      "clickhouse/schema.sql"     = { mode = "0644", content = file("${local.clickhouse_dir}/schema.sql") }
      "clickhouse/users.sh"       = { mode = "0755", content = file("${local.clickhouse_dir}/users.sh") }
      "clickhouse/low-memory.xml" = { mode = "0644", content = local.clickhouse_overrides }
      "site.d/auth.caddy"         = { mode = "0644", content = local.auth_caddy }
    },
    local.restricted ? {
      "site.d/allowlist.caddy" = { mode = "0644", content = local.allowlist_caddy }
    } : {}
  )

  # One JSON document; the machine unpacks it beside the compose file. Secret
  # stores take about 64 KB, see the check below.
  bundle = jsonencode({
    version = 1
    files   = local.files
  })
}

resource "terraform_data" "bundle_size" {
  lifecycle {
    precondition {
      condition     = length(local.bundle) < 60000
      error_message = "The configuration bundle is larger than 60 KB and no longer fits in one AWS Secrets Manager or Google Secret Manager secret."
    }
  }
}
