output "bucket_name" {
  description = "S3 bucket used for static MFE assets."
  value       = aws_s3_bucket.this.id
}

output "cloudfront_distribution_ids" {
  description = "CloudFront distribution IDs by MFE."
  value       = { for name, distribution in aws_cloudfront_distribution.this : name => distribution.id }
}

output "cloudfront_domain_names" {
  description = "CloudFront distribution domain names by MFE."
  value       = { for name, distribution in aws_cloudfront_distribution.this : name => distribution.domain_name }
}

output "urls" {
  description = "Public HTTPS URLs by MFE."
  value       = { for name, domain in local.domains : name => "https://${domain}" }
}
