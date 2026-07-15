output "keycloak_realm_id" {
  description = "Internal Keycloak ID of the created realm."
  value       = module.keycloak.realm_id
}

output "keycloak_realm_name" {
  description = "Name of the created Keycloak realm."
  value       = module.keycloak.realm_name
}

output "rmu_client_id" {
  description = "Client ID of rmu-client."
  value       = module.keycloak.rmu_client_id
}

output "rmu_client_secret" {
  description = "Client secret of rmu-client."
  value       = module.keycloak.rmu_client_secret
  sensitive   = true
}
