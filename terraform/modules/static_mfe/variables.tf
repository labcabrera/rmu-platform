variable "name_prefix" {
  description = "Name prefix used for static MFE resources."
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for all MFE static assets."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID."
  type        = string
}

variable "domain_name" {
  description = "Main domain name."
  type        = string
}

variable "cloudfront_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront aliases."
  type        = string
}

variable "mfe_apps" {
  description = "Micro-frontends exposed through CloudFront."
  type = map(object({
    subdomain              = string
    origin_path            = string
    default_root_object    = optional(string, "index.html")
    cloudfront_price_class = optional(string, "PriceClass_100")
  }))
}

variable "tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default     = {}
}
