# Shared infrastructure — chạy 1 lần cho toàn bộ project
#
# Tạo VPC dùng chung cho prod và dev environments:
#   VPC          10.0.0.0/16
#   public        10.0.1.0/24   → prod EC2 + dev EC2
#   private       10.0.10.0/24  → future: RDS, ElastiCache
#
# Cách chạy:
#   cd infra/aws/shared
#   terraform init
#   terraform apply
#
# Outputs (vpc_id, public_subnet_id, private_subnet_id) được đọc bởi
# environments/prod và environments/dev qua terraform_remote_state.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket = "intrepid-terraform-state"
    key    = "shared/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = {
      Project   = "intrepid-flow"
      ManagedBy = "terraform"
    }
  }
}

# ── VPC ──────────────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "intrepid-flow-vpc" }
}

# ── Internet Gateway ─────────────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "intrepid-flow-igw" }
}

# ── Public Subnet 10.0.1.0/24 ────────────────────────────────────────
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-southeast-1a"
  map_public_ip_on_launch = true
  tags = { Name = "intrepid-flow-public", Tier = "public" }
}

# ── Private Subnet 10.0.10.0/24 (future: RDS, ElastiCache) ──────────
resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "ap-southeast-1a"
  tags = { Name = "intrepid-flow-private", Tier = "private" }
}

# ── Route Table: public → IGW ────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "intrepid-flow-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ── Outputs ──────────────────────────────────────────────────────────
output "vpc_id" {
  description = "Shared VPC ID — pass to environments/prod and dev"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Public subnet ID — prod EC2 + dev EC2"
  value       = aws_subnet.public.id
}

output "private_subnet_id" {
  description = "Private subnet ID — future RDS / ElastiCache"
  value       = aws_subnet.private.id
}
