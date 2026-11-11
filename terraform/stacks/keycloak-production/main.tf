# Keycloak realm of production (workspace spec 103). Applied from a workstation through an SSH tunnel to the
# loopback port of Keycloak on the server: ssh -L 8090:127.0.0.1:8090 <user>@<host>. See
# docs/operations/keycloak-terraform.adoc.
module "keycloak" {
  source = "../../modules/keycloak"

  realm_name         = var.realm_name
  realm_display_name = var.realm_display_name

  api_audience         = var.api_audience
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret

  smtp_host     = var.smtp_host
  smtp_port     = var.smtp_port
  smtp_from     = var.smtp_from
  smtp_ssl      = var.smtp_ssl
  smtp_starttls = var.smtp_starttls
  smtp_username = var.smtp_username
  smtp_password = var.smtp_password

  rmu_client_secret                    = var.rmu_client_secret
  rmu_client_valid_redirect_uris       = ["${var.public_url}/*"]
  rmu_client_web_origins               = [var.public_url]
  rmu_client_front_valid_redirect_uris = ["${var.public_url}/*"]
  rmu_client_front_web_origins         = [var.public_url]

  primary_user_username           = var.primary_user_username
  primary_user_email              = var.primary_user_email
  primary_user_first_name         = var.primary_user_first_name
  primary_user_last_name          = var.primary_user_last_name
  primary_user_password           = var.primary_user_password
  primary_user_password_temporary = true

  # No test users in production.
  create_guest_user = false
}
