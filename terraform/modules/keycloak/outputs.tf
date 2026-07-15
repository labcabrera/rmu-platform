output "realm_id" {
  description = "Internal Keycloak ID of the created realm."
  value       = keycloak_realm.rmu.id
}

output "realm_name" {
  description = "Name of the created realm."
  value       = keycloak_realm.rmu.realm
}

output "group_rmu_admin_id" {
  description = "ID of the rmu-admin group."
  value       = keycloak_group.rmu_admin.id
}

output "group_rmu_core_law_id" {
  description = "ID of the rmu-core-law group."
  value       = keycloak_group.rmu_core_law.id
}

output "group_rmu_spell_law_id" {
  description = "ID of the rmu-spell-law group."
  value       = keycloak_group.rmu_spell_law.id
}

output "group_rmu_treasure_law_id" {
  description = "ID of the rmu-treasure-law group."
  value       = keycloak_group.rmu_treasure_law.id
}

output "group_rmu_creature_law_i_id" {
  description = "ID of the rmu-creature-law-i group."
  value       = keycloak_group.rmu_creature_law_i.id
}

output "rmu_client_id" {
  description = "Client ID of rmu-client."
  value       = keycloak_openid_client.rmu_client.client_id
}

output "rmu_client_secret" {
  description = "Client secret of rmu-client."
  value       = keycloak_openid_client.rmu_client.client_secret
  sensitive   = true
}
