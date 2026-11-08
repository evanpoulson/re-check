# One EC2 box in the default VPC running `docker compose` (Caddy → nginx → FastAPI).
# The database stays on Tiger Cloud. Nothing else: no load balancer, NAT, CloudFront or logs.

data "aws_vpc" "default" {
  default = true
}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

resource "aws_key_pair" "deploy" {
  key_name_prefix = "recheck-deploy-"
  public_key      = var.ssh_public_key
}

resource "aws_security_group" "app" {
  name_prefix = "recheck-app-"
  description = "Recheck demo box: SSH for deploys, HTTP and HTTPS for Caddy"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH (deploy workflow)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_cidrs
  }

  ingress {
    description = "HTTP (certificate challenge and redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP/3"
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Tiger Cloud, GitHub, Docker Hub, Lets Encrypt, AHS feed"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "app" {
  ami                         = nonsensitive(data.aws_ssm_parameter.ubuntu.value)
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.deploy.key_name
  vpc_security_group_ids      = [aws_security_group.app.id]
  associate_public_ip_address = true

  user_data                   = templatefile("${path.module}/user-data.sh", { repo_url = var.repo_url })
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = "recheck-app"
  }

  lifecycle {
    # A newer Ubuntu image shouldn't replace the running box mid-hackathon.
    ignore_changes = [ami]
  }
}

# A fixed address, so the sslip.io hostname, the QR links and DEPLOY_HOST survive a stop/start.
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = {
    Name = "recheck-app"
  }
}
