output "keycloak_realm_name" {
  description = "Name of the realm."
  value       = module.keycloak.realm_name
}

output "primary_user_id" {
  description = "Keycloak ID (sub) of the primary user: TARGET_SUB of scripts/reassign-users.js."
  value       = module.keycloak.primary_user_id
}

output "rmu_client_secret" {
  description = "Client secret of rmu-client."
  value       = module.keycloak.rmu_client_secret
  sensitive   = true
}
