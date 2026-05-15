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

variable "rmu_client_front_valid_redirect_uris" {
  description = "List of valid redirect URIs for rmu-client-front."
  type        = list(string)
  default     = ["http://localhost:8080/*"]
}

variable "rmu_client_front_web_origins" {
  description = "List of allowed web origins for rmu-client-front (CORS)."
  type        = list(string)
  default     = ["http://localhost:*"]
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
