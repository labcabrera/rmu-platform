terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.4"
    }
  }
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
}

variable "google_client_secret" {
  description = "OAuth client secret of the Google identity provider. A placeholder until the application is installed."
  type        = string
  sensitive   = true
}

variable "smtp_host" {
  description = "SMTP host used by the realm (password reset, email verification). Empty disables mail and email verification."
  type        = string
  default     = ""
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
  default     = ["http://localhost/*"]
}

variable "rmu_client_web_origins" {
  description = "List of allowed web origins for rmu-client (CORS)."
  type        = list(string)
  default     = ["http://localhost"]
}

variable "rmu_client_front_valid_redirect_uris" {
  description = "List of valid redirect URIs for rmu-client-front."
  type        = list(string)
  default     = ["http://localhost/*"]
}

variable "rmu_client_front_web_origins" {
  description = "List of allowed web origins for rmu-client-front (CORS)."
  type        = list(string)
  default     = ["http://localhost"]
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
