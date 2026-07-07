# Bootstrap — chạy 1 lần duy nhất cho mỗi AWS account
#
# Tạo các account-level resources mà dev/prod environments cần reference:
#   - GitHub Actions OIDC provider
#
# Cách chạy:
#   cd infra/aws/bootstrap
#   terraform init
#   terraform apply
#
# State lưu local (terraform.tfstate) — không cần S3 backend.
# Commit terraform.tfstate vào git để team biết provider đã được tạo.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "local" {}
}

provider "aws" {
  region = "ap-southeast-1"
}

# GitHub Actions OIDC provider — cho phép GitHub Actions assume IAM role
# mà không cần static AWS credentials
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

output "oidc_provider_arn" {
  description = "Dùng để xác nhận OIDC provider đã được tạo"
  value       = aws_iam_openid_connect_provider.github.arn
}
