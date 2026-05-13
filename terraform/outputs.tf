output "mfe_bucket_name" {
  description = "S3 bucket used as the single static MFE repository."
  value       = module.static_mfe.bucket_name
}

output "mfe_cloudfront_domains" {
  description = "CloudFront distribution domain names by MFE."
  value       = module.static_mfe.cloudfront_domain_names
}

output "mfe_urls" {
  description = "Public MFE URLs by MFE."
  value       = module.static_mfe.urls
}

output "api_instance_id" {
  description = "EC2 instance ID running the API Docker Compose stack."
  value       = module.api_host.instance_id
}

output "api_alb_dns_name" {
  description = "DNS name of the API Application Load Balancer."
  value       = module.api_host.alb_dns_name
}

output "api_urls" {
  description = "Public API URLs by API route."
  value       = module.api_host.urls
}
