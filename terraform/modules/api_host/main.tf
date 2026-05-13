locals {
  domains = {
    for name, route in var.api_routes :
    name => "${route.subdomain}.${var.domain_name}"
  }

  api_ports = distinct([for route in var.api_routes : route.port])
}

data "aws_ami" "debian" {
  count       = var.api_instance_ami_id == null ? 1 : 0
  most_recent = true
  owners      = ["136693071363"]

  filter {
    name   = "name"
    values = ["debian-12-amd64-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-api-alb-sg"
  description = "Public access to the API ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_allowed_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.alb_allowed_cidrs
  }

  egress {
    description = "Outbound to API instance"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-alb-sg"
  })
}

resource "aws_security_group" "instance" {
  name        = "${var.name_prefix}-api-instance-sg"
  description = "API EC2 instance access from ALB"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = toset(local.api_ports)

    content {
      description     = "API port ${ingress.value} from ALB"
      from_port       = ingress.value
      to_port         = ingress.value
      protocol        = "tcp"
      security_groups = [aws_security_group.alb.id]
    }
  }

  dynamic "ingress" {
    for_each = length(var.ssh_allowed_cidrs) > 0 ? [1] : []

    content {
      description = "SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.ssh_allowed_cidrs
    }
  }

  egress {
    description = "Outbound internet access"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-instance-sg"
  })
}

resource "aws_instance" "api" {
  ami                         = var.api_instance_ami_id != null ? var.api_instance_ami_id : data.aws_ami.debian[0].id
  instance_type               = var.api_instance_type
  subnet_id                   = var.public_subnet_ids[0]
  vpc_security_group_ids      = [aws_security_group.instance.id]
  associate_public_ip_address = true
  key_name                    = var.key_name

  user_data_replace_on_change = true
  user_data = templatefile("${path.root}/user_data.sh.tftpl", {
    docker_compose_content  = var.docker_compose_content
    api_environment_content = var.api_environment_content
  })

  root_block_device {
    encrypted   = true
    volume_size = 40
    volume_type = "gp3"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-host"
  })
}

resource "aws_lb" "api" {
  name                       = substr(replace("${var.name_prefix}-api-alb", "_", "-"), 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = var.enable_deletion_protection

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-alb"
  })
}

resource "aws_lb_target_group" "api" {
  for_each = var.api_routes

  name        = substr(replace("${var.name_prefix}-${each.key}", "_", "-"), 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-499"
    path                = each.value.health_check_path
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 5
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-${each.key}-tg"
  })
}

resource "aws_lb_target_group_attachment" "api" {
  for_each = aws_lb_target_group.api

  target_group_arn = each.value.arn
  target_id        = aws_instance.api.id
  port             = var.api_routes[each.key].port
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "RMU API Gateway"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  for_each = var.api_routes

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[each.key].arn
  }

  condition {
    host_header {
      values = [local.domains[each.key]]
    }
  }
}

resource "aws_route53_record" "api" {
  for_each = local.domains

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
