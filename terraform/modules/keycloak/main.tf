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
  remember_me                    = true
  verify_email                   = var.smtp_host != ""
  login_with_email_allowed       = true
  duplicate_emails_allowed       = false

  ssl_required    = "external"
  password_policy = "length(8) and notUsername"

  # Short access tokens, renewed with the refresh token. "Remember me" makes the session cookie
  # persistent and stretches the session; without it the session ends after 30 min idle.
  access_token_lifespan                   = "15m"
  access_token_lifespan_for_implicit_flow = "15m"
  sso_session_idle_timeout                = "30m"
  sso_session_max_lifespan                = "10h"
  sso_session_idle_timeout_remember_me    = "720h"
  sso_session_max_lifespan_remember_me    = "2160h"
  offline_session_idle_timeout            = "720h"
  offline_session_max_lifespan_enabled    = false

  internationalization {
    supported_locales = ["en", "es"]
    default_locale    = "en"
  }

  security_defenses {
    brute_force_detection {
      permanent_lockout  = false
      max_login_failures = 10
    }
  }

  dynamic "smtp_server" {
    for_each = var.smtp_host == "" ? [] : [1]
    content {
      host              = var.smtp_host
      port              = var.smtp_port
      from              = var.smtp_from
      from_display_name = var.realm_display_name
      ssl               = false
      starttls          = false
    }
  }
}

# Login and admin events, kept for a week for troubleshooting.
resource "keycloak_realm_events" "rmu" {
  realm_id = keycloak_realm.rmu.id

  events_enabled    = true
  events_expiration = 604800
  events_listeners  = ["jboss-logging"]

  admin_events_enabled         = true
  admin_events_details_enabled = false
}

# -----------------------------------------------------------------------------
# Groups
# -----------------------------------------------------------------------------

resource "keycloak_group" "rmu_admin" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-admin"
}

# Every registered user: the APIs let it create entities (BaseEntityGuard.checkCreate). It is a default group, so new
# users (also the ones that come from Google) get it (workspace spec 021, decision 4).
resource "keycloak_group" "rmu_user" {
  realm_id = keycloak_realm.rmu.id
  name     = "rmu-user"
}

resource "keycloak_default_groups" "default" {
  realm_id  = keycloak_realm.rmu.id
  group_ids = [keycloak_group.rmu_user.id]

  # The guest user is created before the default group is set; guest_user_groups keeps it without groups if it is
  # created again later.
  depends_on = [keycloak_user.guest_user]
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
# Client scope: rmu-api (audience checked by every API, and how the user signed in)
# -----------------------------------------------------------------------------

resource "keycloak_openid_client_scope" "rmu_api" {
  realm_id               = keycloak_realm.rmu.id
  name                   = "rmu-api"
  description            = "Adds the RMU APIs audience and the identity provider of the session to the token."
  include_in_token_scope = false
}

resource "keycloak_openid_audience_protocol_mapper" "rmu_api_audience" {
  realm_id        = keycloak_realm.rmu.id
  client_scope_id = keycloak_openid_client_scope.rmu_api.id
  name            = "rmu-api-audience"

  included_custom_audience = var.api_audience
  add_to_id_token          = false
  add_to_access_token      = true
}

# Keycloak stores the broker alias (e.g. google) in the identity_provider session note. Local logins
# have no note, so the claim is absent.
resource "keycloak_openid_user_session_note_protocol_mapper" "rmu_api_identity_provider" {
  realm_id        = keycloak_realm.rmu.id
  client_scope_id = keycloak_openid_client_scope.rmu_api.id
  name            = "identity-provider"

  claim_name          = "identity_provider"
  claim_value_type    = "String"
  session_note        = "identity_provider"
  add_to_id_token     = true
  add_to_access_token = true
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

  # "+" allows the same URIs as valid_redirect_uris after logout.
  valid_post_logout_redirect_uris = ["+"]
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
    keycloak_openid_client_scope.groups.name, keycloak_openid_client_scope.groups.name,
    keycloak_openid_client_scope.rmu_api.name,
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

# The APIs map the groups claim to RMU roles. Service-to-service calls (for
# example strategic reading a trait from core) need rmu-admin to read entities
# that are not public.
resource "keycloak_user_groups" "rmu_client_service_account_groups" {
  realm_id = keycloak_realm.rmu.id
  user_id  = keycloak_openid_client.rmu_client.service_account_user_id

  group_ids = [
    keycloak_group.rmu_admin.id,
  ]
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

  # "+" allows the same URIs as valid_redirect_uris after logout.
  valid_post_logout_redirect_uris = ["+"]
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
    keycloak_openid_client_scope.groups.name, keycloak_openid_client_scope.groups.name,
    keycloak_openid_client_scope.rmu_api.name,
  ]
}

# -----------------------------------------------------------------------------
# Google login
# -----------------------------------------------------------------------------

# First login through a broker: ask only for missing profile attributes, then create the user or, when
# an account with the same email exists, link to it with no password prompt (spec 006: accepted risk,
# Google verifies its emails and local registrations verify theirs).
resource "keycloak_authentication_flow" "first_broker_login" {
  realm_id    = keycloak_realm.rmu.id
  alias       = "rmu first broker login"
  description = "First broker login that links an existing account with the same email automatically."
  provider_id = "basic-flow"
}

resource "keycloak_authentication_execution" "first_broker_login_review_profile" {
  realm_id          = keycloak_realm.rmu.id
  parent_flow_alias = keycloak_authentication_flow.first_broker_login.alias
  authenticator     = "idp-review-profile"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "first_broker_login_review_profile" {
  realm_id     = keycloak_realm.rmu.id
  execution_id = keycloak_authentication_execution.first_broker_login_review_profile.id
  alias        = "rmu-review-profile-missing"
  config = {
    "update.profile.on.first.login" = "missing"
  }
}

resource "keycloak_authentication_subflow" "first_broker_login_user" {
  realm_id          = keycloak_realm.rmu.id
  parent_flow_alias = keycloak_authentication_flow.first_broker_login.alias
  alias             = "rmu first broker login user"
  provider_id       = "basic-flow"
  requirement       = "REQUIRED"

  depends_on = [keycloak_authentication_execution.first_broker_login_review_profile]
}

resource "keycloak_authentication_execution" "first_broker_login_create_user" {
  realm_id          = keycloak_realm.rmu.id
  parent_flow_alias = keycloak_authentication_subflow.first_broker_login_user.alias
  authenticator     = "idp-create-user-if-unique"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_execution" "first_broker_login_auto_link" {
  realm_id          = keycloak_realm.rmu.id
  parent_flow_alias = keycloak_authentication_subflow.first_broker_login_user.alias
  authenticator     = "idp-auto-link"
  requirement       = "ALTERNATIVE"

  depends_on = [keycloak_authentication_execution.first_broker_login_create_user]
}

# The credentials are placeholders until the application is installed: the button is shown, and
# Google rejects the sign-in until real ones are set in terraform.tfvars (docs/operations/keycloak-terraform.adoc).
resource "keycloak_oidc_google_identity_provider" "google" {
  realm         = keycloak_realm.rmu.id
  client_id     = var.google_client_id
  client_secret = var.google_client_secret

  trust_email                   = true
  sync_mode                     = "IMPORT"
  hide_on_login_page            = false
  first_broker_login_flow_alias = keycloak_authentication_flow.first_broker_login.alias

  depends_on = [keycloak_authentication_execution.first_broker_login_auto_link]
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
    keycloak_group.rmu_user.id,
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

# The guest stays read only: no groups, also no rmu-user, which Keycloak gives every new user as a default group.
# Exhaustive, so an apply removes any group it gets (for example rmu-user when the user is created again).
resource "keycloak_user_groups" "guest_user_groups" {
  realm_id   = keycloak_realm.rmu.id
  user_id    = keycloak_user.guest_user.id
  group_ids  = []
  exhaustive = true
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
