variable "project_name" {
  description = "Project name used in resource naming."
  type        = string
  default     = "rmu-platform"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region where regional resources are created."
  type        = string
  default     = "eu-west-1"
}

variable "domain_name" {
  description = "Main domain used to create Route53 records."
  type        = string
  default     = "labcabrera.com"
}

variable "hosted_zone_name" {
  description = "Route53 hosted zone name. Defaults to domain_name when null."
  type        = string
  default     = null
}

variable "vpc_cidr" {
  description = "CIDR block for the platform VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.40.1.0/24", "10.40.2.0/24"]
}

variable "mfe_bucket_name" {
  description = "Name of the single S3 bucket that stores all MFE static assets. Defaults to a generated project/environment/domain name."
  type        = string
  default     = null
}

variable "mfe_apps" {
  description = "Micro-frontends exposed through CloudFront. Each app uses the shared S3 bucket and a dedicated origin path."
  type = map(object({
    subdomain              = string
    origin_path            = string
    default_root_object    = optional(string, "index.html")
    cloudfront_price_class = optional(string, "PriceClass_100")
  }))
  default = {
    shell = {
      subdomain   = "app"
      origin_path = "/shell"
    }
    core = {
      subdomain   = "core"
      origin_path = "/core"
    }
    strategic = {
      subdomain   = "strategic"
      origin_path = "/strategic"
    }
    tactical = {
      subdomain   = "tactical"
      origin_path = "/tactical"
    }
    npcs = {
      subdomain   = "npcs"
      origin_path = "/npcs"
    }
    spells = {
      subdomain   = "spells"
      origin_path = "/spells"
    }
  }
}

variable "api_routes" {
  description = "API host-based routing rules for the ALB. Each entry maps one subdomain to one container port on the EC2 instance."
  type = map(object({
    subdomain         = string
    port              = number
    health_check_path = optional(string, "/")
    priority          = number
  }))
  default = {
    core = {
      subdomain = "core-api"
      port      = 3001
      priority  = 10
    }
    strategic = {
      subdomain = "strategic-api"
      port      = 3002
      priority  = 20
    }
    tactical = {
      subdomain = "tactical-api"
      port      = 3003
      priority  = 30
    }
    attack_tables = {
      subdomain = "attack-tables-api"
      port      = 3005
      priority  = 40
    }
    items = {
      subdomain = "items-api"
      port      = 3006
      priority  = 50
    }
    npc_names = {
      subdomain = "npc-names-api"
      port      = 3007
      priority  = 60
    }
    npcs = {
      subdomain = "npcs-api"
      port      = 3008
      priority  = 70
    }
    spells = {
      subdomain = "spells-api"
      port      = 3009
      priority  = 80
    }
    attack = {
      subdomain = "attack-api"
      port      = 8000
      priority  = 90
    }
  }
}

variable "api_instance_type" {
  description = "EC2 instance type used to run the API Docker Compose stack."
  type        = string
  default     = "t3.medium"
}

variable "api_instance_ami_id" {
  description = "Optional AMI ID for the API EC2 instance. When null, the latest Debian 12 AMI is used."
  type        = string
  default     = null
}

variable "key_name" {
  description = "Optional EC2 key pair name for SSH access."
  type        = string
  default     = null
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the API EC2 instance."
  type        = list(string)
  default     = []
}

variable "alb_allowed_cidrs" {
  description = "CIDR blocks allowed to reach the public ALB."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "api_docker_compose_file" {
  description = "Path to the Docker Compose file copied into the API EC2 instance."
  type        = string
  default     = "../docker-compose/docker-compose-apis.yaml"
}

variable "api_environment" {
  description = "Environment variables written to the API EC2 .env file used by Docker Compose."
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection on the API ALB."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags applied to all supported resources."
  type        = map(string)
  default     = {}
}
