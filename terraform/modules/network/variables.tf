variable "name_prefix" {
  description = "Name prefix used for network resources."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets."
  type        = list(string)
}

variable "availability_zones" {
  description = "Availability zones used by public subnets."
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default     = {}
}
