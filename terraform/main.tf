data "aws_route53_zone" "main" {
  name         = local.hosted_zone_name
  private_zone = false
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.us_east_1
  domain_name               = local.all_mfe_domain_names[0]
  subject_alternative_names = slice(local.all_mfe_domain_names, 1, length(local.all_mfe_domain_names))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cloudfront_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_certificate_validation : record.fqdn]
}

resource "aws_acm_certificate" "api" {
  domain_name               = local.all_api_domain_names[0]
  subject_alternative_names = slice(local.all_api_domain_names, 1, length(local.all_api_domain_names))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "api_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_certificate_validation : record.fqdn]
}

module "network" {
  source = "./modules/network"

  name_prefix         = local.name_prefix
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidrs = var.public_subnet_cidrs
  availability_zones  = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  tags                = local.common_tags
}

module "static_mfe" {
  source = "./modules/static_mfe"

  name_prefix                = local.name_prefix
  bucket_name                = local.mfe_bucket_name
  hosted_zone_id             = data.aws_route53_zone.main.zone_id
  domain_name                = var.domain_name
  mfe_apps                   = var.mfe_apps
  cloudfront_certificate_arn = aws_acm_certificate_validation.cloudfront.certificate_arn
  tags                       = local.common_tags
}

module "api_host" {
  source = "./modules/api_host"

  name_prefix                = local.name_prefix
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  hosted_zone_id             = data.aws_route53_zone.main.zone_id
  domain_name                = var.domain_name
  api_routes                 = var.api_routes
  api_instance_type          = var.api_instance_type
  api_instance_ami_id        = var.api_instance_ami_id
  key_name                   = var.key_name
  ssh_allowed_cidrs          = var.ssh_allowed_cidrs
  alb_allowed_cidrs          = var.alb_allowed_cidrs
  certificate_arn            = aws_acm_certificate_validation.api.certificate_arn
  enable_deletion_protection = var.enable_deletion_protection
  docker_compose_content     = file(var.api_docker_compose_file)
  api_environment_content    = join("\n", local.api_environment_lines)
  tags                       = local.common_tags
}
