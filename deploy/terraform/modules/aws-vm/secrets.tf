# Two secrets. The instance role can read the first one only.
#
#   <name>/config-bundle         everything beside the compose file, including
#                                .env with the database passwords
#   <name>/basic-auth-password   the login password in clear, for operators
#                                (the bundle holds only its bcrypt hash)

resource "aws_secretsmanager_secret" "bundle" {
  name                    = "${var.name}/config-bundle"
  description             = "Tersect Browser ${var.name}: configuration fetched by the instance"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "bundle" {
  secret_id     = aws_secretsmanager_secret.bundle.id
  secret_string = var.bundle
}

resource "aws_secretsmanager_secret" "password" {
  name                    = "${var.name}/basic-auth-password"
  description             = "Tersect Browser ${var.name}: password of the shared login"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "password" {
  secret_id     = aws_secretsmanager_secret.password.id
  secret_string = var.basic_auth_password
}
