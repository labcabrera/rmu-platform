# ---------------------------------------------------------------------------
# Keycloak
# ---------------------------------------------------------------------------

variable "keycloak_url" {
  description = "Base URL of the Keycloak instance (e.g. http://localhost:8090)."
  type        = string
}

variable "keycloak_base_path" {
  description = "Path Keycloak is served under (KC_HTTP_RELATIVE_PATH)."
  type        = string
  default     = "/sso"
}

variable "keycloak_admin_username" {
  description = "Keycloak admin username."
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password."
  type        = string
  sensitive   = true
}

variable "realm_name" {
  description = "Name of the Keycloak realm to create."
  type        = string
  default     = "rmu"
}

variable "realm_display_name" {
  description = "Display name of the realm shown in the Keycloak UI."
  type        = string
  default     = "RMU Platform"
}

variable "api_audience" {
  description = "Audience added to every access token and checked by the APIs (RMU_IAM_AUDIENCE)."
  type        = string
  default     = "rmu-api"
}

variable "google_client_id" {
  description = "OAuth client ID of the Google identity provider. A placeholder until the application is installed."
  type        = string
  default     = "placeholder-google-client-id"
}

variable "google_client_secret" {
  description = "OAuth client secret of the Google identity provider. A placeholder until the application is installed."
  type        = string
  sensitive   = true
  default     = "placeholder-google-client-secret"
}

variable "smtp_host" {
  description = "SMTP host used by the realm. Locally, the Mailpit container. Empty disables mail and email verification."
  type        = string
  default     = "rmu-mailpit"
}

variable "smtp_port" {
  description = "SMTP port."
  type        = string
  default     = "1025"
}

variable "smtp_from" {
  description = "Sender address of the realm emails."
  type        = string
  default     = "no-reply@rmu.local"
}

variable "rmu_client_secret" {
  description = "Client secret for rmu-client."
  type        = string
  sensitive   = true
}

variable "rmu_client_valid_redirect_uris" {
  description = "List of valid redirect URIs for rmu-client."
  type        = list(string)
  default     = ["http://localhost/*", "http://localhost:8080/*"]
}

variable "rmu_client_web_origins" {
  description = "List of allowed web origins for rmu-client (CORS)."
  type        = list(string)
  default     = ["http://localhost", "http://localhost:8080"]
}

variable "rmu_client_front_valid_redirect_uris" {
  description = "List of valid redirect URIs for rmu-client-front. Add LAN addresses in terraform.tfvars."
  type        = list(string)
  default = [
    "http://localhost/*",
    "http://localhost:8080/*",
    "http://localhost:3000/*",
    "http://localhost:3001/*",
    "http://localhost:3002/*",
    "http://localhost:3003/*",
    "http://localhost:5173/*",
    "http://127.0.0.1:3000/*",
    "http://127.0.0.1:3001/*",
    "http://127.0.0.1:3002/*",
    "http://127.0.0.1:3003/*",
    "http://127.0.0.1:5173/*"
  ]
}

variable "rmu_client_front_web_origins" {
  description = "List of allowed web origins for rmu-client-front (CORS). Add LAN addresses in terraform.tfvars."
  type        = list(string)
  default = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:5173"
  ]
}

variable "primary_user_username" {
  description = "Username for the primary user."
  type        = string
}

variable "primary_user_email" {
  description = "Email for the primary user."
  type        = string
}

variable "primary_user_first_name" {
  description = "First name of the primary user."
  type        = string
}

variable "primary_user_last_name" {
  description = "Last name of the primary user."
  type        = string
}

variable "primary_user_password" {
  description = "Password for the primary user."
  type        = string
  sensitive   = true
}

variable "guest_user_username" {
  description = "Username for the guest user."
  type        = string
  default     = "guest"
}

variable "guest_user_email" {
  description = "Email for the guest user."
  type        = string
}

variable "guest_user_first_name" {
  description = "First name of the guest user."
  type        = string
}

variable "guest_user_last_name" {
  description = "Last name of the guest user."
  type        = string
}

variable "guest_user_password" {
  description = "Password for the guest user."
  type        = string
  sensitive   = true
}
