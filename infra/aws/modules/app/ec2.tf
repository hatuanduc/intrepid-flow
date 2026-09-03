data "aws_ami" "ubuntu_arm" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu_arm.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # No key_pair — access via SSM Session Manager instead of SSH

  # Runs automatically on first boot — installs Docker Engine + Nginx only
  # App runtime (PG, Redis, Playwright) lives inside Docker containers
  # Changing this does NOT replace the instance (user_data only runs once on creation)
  user_data = base64encode(file("${path.module}/../../scripts/bootstrap.sh"))

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
  }

  # data.aws_ami.ubuntu_arm re-resolves to whatever Canonical's latest build is on every
  # plan. Without this, a routine `terraform apply` picks up a newer AMI id, `ami` is a
  # force-new attribute on aws_instance, and Terraform silently terminates this instance
  # and boots a fresh one — destroying the root volume (delete_on_termination = true above)
  # and with it the only copy of Postgres's data (postgres_data is a Docker named volume
  # living on that same root volume, not a separate persistent EBS volume). That's exactly
  # what happened on 2026-09-03: an apply picked up a new AMI, replaced the dev instance,
  # and wiped the entire database with no backup to restore from.
  # Bump the AMI deliberately by removing this ignore (or tainting the resource) when you
  # actually want to rebuild the instance on a newer base image.
  lifecycle {
    ignore_changes = [ami]
  }

  # AWS defaults IMDSv2's hop limit to 1 — enough for processes running directly on the host, but
  # the api container's AWS SDK calls (S3 + Lambda invoke for reconcile) go through Docker's bridge
  # network, which adds a hop. Without this, those SDK calls fail to fetch instance-role credentials
  # entirely (IMDSv2 request from inside the container silently gets dropped, not just slow).
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tags = {
    Name = local.name_prefix
    Env  = var.env
  }
}

# Không dùng Elastic IP — subnet có map_public_ip_on_launch = true (xem shared/main.tf)
# nên EC2 tự nhận public IP mỗi lần start, đổi mỗi lần start/stop.
# Tiết kiệm ~$3.6/tháng/instance so với EIP. Đổi lại: DNS phải tự cập nhật —
# xem scripts/update-dns.sh (systemd service chạy mỗi lần boot, cài trong bootstrap.sh).
