# ---------------------------------------------------------------------------
# Keycloak (through the SSH tunnel)
# ---------------------------------------------------------------------------

variable "keycloak_url" {
  description = "Keycloak as seen through the SSH tunnel to the server."
  type        = string
  default     = "http://127.0.0.1:8090"
}

variable "keycloak_base_path" {
  description = "Path Keycloak is served under (KC_HTTP_RELATIVE_PATH)."
  type        = string
  default     = "/sso"
}

variable "keycloak_admin_username" {
  description = "Bootstrap admin of the master realm (KC_BOOTSTRAP_ADMIN_USERNAME in .env.production)."
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Bootstrap admin password (KC_BOOTSTRAP_ADMIN_PASSWORD in .env.production)."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Realm
# ---------------------------------------------------------------------------

variable "public_url" {
  description = "Public origin of the application, without a trailing slash (https://rmu.labcabrera.com)."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.public_url))
    error_message = "public_url must be an https origin without a path or a trailing slash."
  }
}

variable "realm_name" {
  description = "Name of the Keycloak realm (RMU_IAM_REALM)."
  type        = string
  default     = "rmu"
}

variable "realm_display_name" {
  description = "Display name of the realm on the sign-in pages and in the emails."
  type        = string
  default     = "Rolemaster Unified Engine"
}

variable "api_audience" {
  description = "Audience added to every access token and checked by the APIs (RMU_IAM_AUDIENCE)."
  type        = string
  default     = "rmu-api"
}

variable "rmu_client_secret" {
  description = "Client secret of rmu-client: the same value as RMU_IAM_CLIENT_SECRET in .env.production."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Google sign-in (Google Cloud Console, OAuth client of type web application). Authorized redirect URI:
# <public_url>/sso/realms/<realm_name>/broker/google/endpoint
# ---------------------------------------------------------------------------

variable "google_client_id" {
  description = "OAuth client ID of the Google identity provider."
  type        = string
}

variable "google_client_secret" {
  description = "OAuth client secret of the Google identity provider."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# SMTP (Brevo: smtp-relay.brevo.com, port 587, STARTTLS, the account login and an SMTP key)
# ---------------------------------------------------------------------------

variable "smtp_host" {
  description = "SMTP host of the realm emails (verification, password reset)."
  type        = string
}

variable "smtp_port" {
  description = "SMTP port."
  type        = string
  default     = "587"
}

variable "smtp_from" {
  description = "Sender address, of a domain validated in the SMTP provider (SPF, DKIM)."
  type        = string
}

variable "smtp_ssl" {
  description = "SMTP over TLS from the start (port 465)."
  type        = bool
  default     = false
}

variable "smtp_starttls" {
  description = "STARTTLS (port 587)."
  type        = bool
  default     = true
}

variable "smtp_username" {
  description = "SMTP user."
  type        = string
}

variable "smtp_password" {
  description = "SMTP password or key."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Primary user: administrator of the application and target of scripts/reassign-users.js
# ---------------------------------------------------------------------------

variable "primary_user_username" {
  description = "Username of the primary user."
  type        = string
}

variable "primary_user_email" {
  description = "Email of the primary user."
  type        = string
}

variable "primary_user_first_name" {
  description = "First name of the primary user."
  type        = string
  default     = ""
}

variable "primary_user_last_name" {
  description = "Last name of the primary user."
  type        = string
  default     = ""
}

variable "primary_user_password" {
  description = "Initial password of the primary user: temporary, Keycloak asks for a new one on the first sign-in."
  type        = string
  sensitive   = true
}
