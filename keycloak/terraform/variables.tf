variable "keycloak_url" {
  description = "Base URL of the Keycloak instance (e.g. http://localhost:8080)."
  type        = string
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

variable "rmu_client_secret" {
  description = "Client secret for rmu-client."
  type        = string
  sensitive   = true
}

variable "rmu_client_valid_redirect_uris" {
  description = "List of valid redirect URIs for rmu-client."
  type        = list(string)
  default     = ["http://localhost:*/*"]
}

variable "rmu_client_web_origins" {
  description = "List of allowed web origins for rmu-client (CORS)."
  type        = list(string)
  default     = ["http://localhost:*"]
}
