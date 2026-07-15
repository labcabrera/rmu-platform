# -----------------------------------------------------------------------------
# Realm
# -----------------------------------------------------------------------------

resource "keycloak_realm" "rmu" {
  realm        = var.realm_name
  enabled      = true
  display_name = var.realm_display_name

  registration_allowed           = true
  registration_email_as_username = false
  reset_password_allowed         = true
  remember_me                    = false
  verify_email                   = false
  login_with_email_allowed       = true
  duplicate_emails_allowed       = false

  ssl_required = "external"

  access_token_lifespan                   = "24h"
  access_token_lifespan_for_implicit_flow = "24h"
  sso_session_idle_timeout                = "30m"
  sso_session_max_lifespan                = "10h"
  offline_session_idle_timeout            = "720h"
  offline_session_max_lifespan_enabled    = false
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

resource "keycloak_group" "rmu_treasure_law" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-treasure-law"
}

resource "keycloak_group" "rmu_creature_law_i" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-creature-law-i"
}

# -----------------------------------------------------------------------------
# Client scope: groups
# -----------------------------------------------------------------------------

resource "keycloak_openid_client_scope" "groups" {
  realm_id    = keycloak_realm.rmu.id
  name        = "groups"
  description = "Includes the groups the user belongs to as a claim in the token."
}

resource "keycloak_openid_group_membership_protocol_mapper" "groups_mapper" {
  realm_id        = keycloak_realm.rmu.id
  client_scope_id = keycloak_openid_client_scope.groups.id
  name            = "groups"

  claim_name          = "groups"
  full_path           = false
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# -----------------------------------------------------------------------------
# Client: rmu-client (confidential / authentication enabled)
# -----------------------------------------------------------------------------

resource "keycloak_openid_client" "rmu_client" {
  realm_id  = keycloak_realm.rmu.id
  client_id = "rmu-client"
  name      = "RMU Client"
  enabled   = true

  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = true
  service_accounts_enabled     = true

  client_secret = var.rmu_client_secret

  valid_redirect_uris = var.rmu_client_valid_redirect_uris
  web_origins         = var.rmu_client_web_origins
}

resource "keycloak_openid_hardcoded_claim_protocol_mapper" "rmu_client_groups" {
  realm_id  = keycloak_realm.rmu.id
  client_id = keycloak_openid_client.rmu_client.id
  name      = "hardcoded-groups"

  claim_name       = "groups"
  claim_value      = jsonencode(["rmu-admin", "rmu-admin-tmp"])
  claim_value_type = "JSON"

  add_to_id_token     = false
  add_to_access_token = true
  add_to_userinfo     = false
}

resource "keycloak_openid_client_default_scopes" "rmu_client_default_scopes" {
  realm_id  = keycloak_realm.rmu.id
  client_id = keycloak_openid_client.rmu_client.id

  default_scopes = [
    "basic",
    "profile",
    "email",
    "roles",
    "web-origins",
    keycloak_openid_client_scope.groups.name,
  ]
}

# -----------------------------------------------------------------------------
# Service account role: assign realm-admin to rmu-client
# -----------------------------------------------------------------------------

data "keycloak_openid_client" "realm_management" {
  realm_id  = keycloak_realm.rmu.id
  client_id = "realm-management"
}

data "keycloak_role" "realm_admin" {
  realm_id  = keycloak_realm.rmu.id
  client_id = data.keycloak_openid_client.realm_management.id
  name      = "realm-admin"
}

resource "keycloak_openid_client_service_account_role" "rmu_client_realm_admin" {
  realm_id                = keycloak_realm.rmu.id
  service_account_user_id = keycloak_openid_client.rmu_client.service_account_user_id
  client_id               = data.keycloak_openid_client.realm_management.id
  role                    = data.keycloak_role.realm_admin.name
}

# -----------------------------------------------------------------------------
# Client: rmu-client-front (public / PKCE S256 / SPA)
# -----------------------------------------------------------------------------

resource "keycloak_openid_client" "rmu_client_front" {
  realm_id  = keycloak_realm.rmu.id
  client_id = "rmu-client-front"
  name      = "RMU Client Front"
  enabled   = true

  access_type                  = "PUBLIC"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = false

  pkce_code_challenge_method = "S256"

  valid_redirect_uris = var.rmu_client_front_valid_redirect_uris
  web_origins         = var.rmu_client_front_web_origins
}

resource "keycloak_openid_client_default_scopes" "rmu_client_front_default_scopes" {
  realm_id  = keycloak_realm.rmu.id
  client_id = keycloak_openid_client.rmu_client_front.id

  default_scopes = [
    "basic",
    "profile",
    "email",
    "roles",
    "web-origins",
    keycloak_openid_client_scope.groups.name,
  ]
}

# -----------------------------------------------------------------------------
# User: primary
# -----------------------------------------------------------------------------

resource "keycloak_user" "primary_user" {
  realm_id = keycloak_realm.rmu.id
  username = var.primary_user_username
  enabled  = true

  email          = var.primary_user_email
  email_verified = true
  first_name     = var.primary_user_first_name
  last_name      = var.primary_user_last_name

  initial_password {
    value     = var.primary_user_password
    temporary = false
  }
}

resource "keycloak_user_groups" "primary_user_groups" {
  realm_id = keycloak_realm.rmu.id
  user_id  = keycloak_user.primary_user.id

  group_ids = [
    keycloak_group.rmu_admin.id,
    keycloak_group.rmu_core_law.id,
    keycloak_group.rmu_spell_law.id,
    keycloak_group.rmu_treasure_law.id,
    keycloak_group.rmu_creature_law_i.id,
  ]
}

# -----------------------------------------------------------------------------
# User: guest
# -----------------------------------------------------------------------------

resource "keycloak_user" "guest_user" {
  realm_id = keycloak_realm.rmu.id
  username = var.guest_user_username
  enabled  = true

  email          = var.guest_user_email
  email_verified = true
  first_name     = var.guest_user_first_name
  last_name      = var.guest_user_last_name

  initial_password {
    value     = var.guest_user_password
    temporary = false
  }
}

# -----------------------------------------------------------------------------
# User profile: make firstName and lastName optional
# -----------------------------------------------------------------------------

resource "keycloak_realm_user_profile" "rmu" {
  realm_id = keycloak_realm.rmu.id

  attribute {
    name         = "username"
    display_name = "$${username}"

    validator {
      name = "length"
      config = {
        min = "3"
        max = "255"
      }
    }
    validator {
      name = "username-prohibited-characters"
    }
    validator {
      name = "up-username-not-idn-homograph"
    }

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    required_for_roles = ["user"]
  }

  attribute {
    name         = "email"
    display_name = "$${email}"

    validator {
      name = "email"
    }
    validator {
      name = "length"
      config = {
        max = "255"
      }
    }

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    required_for_roles = ["user"]
  }

  attribute {
    name         = "firstName"
    display_name = "$${firstName}"

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }

  attribute {
    name         = "lastName"
    display_name = "$${lastName}"

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }
  }
}
