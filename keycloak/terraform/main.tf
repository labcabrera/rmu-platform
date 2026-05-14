# -----------------------------------------------------------------------------
# Realm
# -----------------------------------------------------------------------------

resource "keycloak_realm" "rmu" {
  realm        = var.realm_name
  enabled      = true
  display_name = var.realm_display_name

  registration_allowed           = false
  registration_email_as_username = false
  reset_password_allowed         = true
  remember_me                    = false
  verify_email                   = false
  login_with_email_allowed       = true
  duplicate_emails_allowed       = false

  ssl_required = "external"

  access_token_lifespan                = "5m"
  access_token_lifespan_for_implicit_flow = "15m"
  sso_session_idle_timeout             = "30m"
  sso_session_max_lifespan             = "10h"
  offline_session_idle_timeout         = "720h"
  offline_session_max_lifespan_enabled = false
}

# -----------------------------------------------------------------------------
# Groups
# -----------------------------------------------------------------------------

resource "keycloak_group" "rmu_admin" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-admin"
}

resource "keycloak_group" "rmu_core_law" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-core-law"
}

resource "keycloak_group" "rmu_spell_law" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-spell-law"
}

# -----------------------------------------------------------------------------
# Client: rmu-client (confidential / authentication enabled)
# -----------------------------------------------------------------------------

resource "keycloak_openid_client" "rmu_client" {
  realm_id  = keycloak_realm.rmu.id
  client_id = "rmu-client"
  name      = "RMU Client"
  enabled   = true

  access_type              = "CONFIDENTIAL"
  standard_flow_enabled    = true
  implicit_flow_enabled    = false
  direct_access_grants_enabled = true
  service_accounts_enabled = false

  client_secret = var.rmu_client_secret

  valid_redirect_uris = var.rmu_client_valid_redirect_uris
  web_origins         = var.rmu_client_web_origins

  login_theme = "keycloak"
}

# -----------------------------------------------------------------------------
# Client scopes: map groups claim into the token
# -----------------------------------------------------------------------------

resource "keycloak_openid_group_membership_protocol_mapper" "rmu_client_groups" {
  realm_id  = keycloak_realm.rmu.id
  client_id = keycloak_openid_client.rmu_client.id
  name      = "groups"

  claim_name        = "groups"
  full_path         = false
  add_to_id_token   = true
  add_to_access_token = true
  add_to_userinfo   = true
}
