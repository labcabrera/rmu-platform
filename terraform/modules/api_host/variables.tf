variable "name_prefix" {
  description = "Name prefix used for API resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs."
  type        = list(string)
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID."
  type        = string
}

variable "domain_name" {
  description = "Main domain name."
  type        = string
}

variable "api_routes" {
  description = "API host-based routing rules."
  type = map(object({
    subdomain         = string
    port              = number
    health_check_path = optional(string, "/")
    priority          = number
  }))
}

variable "api_instance_type" {
  description = "EC2 instance type."
  type        = string
}

variable "api_instance_ami_id" {
  description = "Optional AMI ID. When null, the latest Debian 12 AMI is used."
  type        = string
  default     = null
}

variable "key_name" {
  description = "Optional EC2 key pair name."
  type        = string
  default     = null
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the instance."
  type        = list(string)
  default     = []
}

variable "alb_allowed_cidrs" {
  description = "CIDR blocks allowed to reach the ALB."
  type        = list(string)
}

variable "certificate_arn" {
  description = "Regional ACM certificate ARN for API domains."
  type        = string
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection on the ALB."
  type        = bool
}

variable "docker_compose_content" {
  description = "Docker Compose content written to the EC2 instance."
  type        = string
}

variable "api_environment_content" {
  description = "Docker Compose .env content written to the EC2 instance."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default     = {}
}
