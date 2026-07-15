module "keycloak" {
  source = "./modules/keycloak"

  realm_name         = var.realm_name
  realm_display_name = var.realm_display_name

  rmu_client_secret                    = var.rmu_client_secret
  rmu_client_valid_redirect_uris       = var.rmu_client_valid_redirect_uris
  rmu_client_web_origins               = var.rmu_client_web_origins
  rmu_client_front_valid_redirect_uris = var.rmu_client_front_valid_redirect_uris
  rmu_client_front_web_origins         = var.rmu_client_front_web_origins

  primary_user_username   = var.primary_user_username
  primary_user_email      = var.primary_user_email
  primary_user_first_name = var.primary_user_first_name
  primary_user_last_name  = var.primary_user_last_name
  primary_user_password   = var.primary_user_password

  guest_user_username   = var.guest_user_username
  guest_user_email      = var.guest_user_email
  guest_user_first_name = var.guest_user_first_name
  guest_user_last_name  = var.guest_user_last_name
  guest_user_password   = var.guest_user_password
}
