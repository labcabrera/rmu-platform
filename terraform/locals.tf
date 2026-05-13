locals {
  hosted_zone_name = coalesce(var.hosted_zone_name, var.domain_name)
  name_prefix      = "${var.project_name}-${var.environment}"
  mfe_bucket_name  = coalesce(var.mfe_bucket_name, replace("${local.name_prefix}-${var.domain_name}-mfe", ".", "-"))

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )

  mfe_domains = {
    for name, app in var.mfe_apps :
    name => "${app.subdomain}.${var.domain_name}"
  }

  api_domains = {
    for name, route in var.api_routes :
    name => "${route.subdomain}.${var.domain_name}"
  }

  all_mfe_domain_names = values(local.mfe_domains)
  all_api_domain_names = values(local.api_domains)

  api_environment_lines = [
    for key, value in var.api_environment :
    "${key}=${value}"
  ]
}
