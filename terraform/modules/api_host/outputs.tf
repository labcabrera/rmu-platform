output "instance_id" {
  description = "API EC2 instance ID."
  value       = aws_instance.api.id
}

output "instance_public_ip" {
  description = "API EC2 public IP."
  value       = aws_instance.api.public_ip
}

output "alb_dns_name" {
  description = "API ALB DNS name."
  value       = aws_lb.api.dns_name
}

output "urls" {
  description = "Public HTTPS API URLs by route."
  value       = { for name, domain in local.domains : name => "https://${domain}" }
}
