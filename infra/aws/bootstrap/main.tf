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

# ── Infra Manager Role ────────────────────────────────────────────────────────
# Role dùng trong GitHub Actions infra job để chạy Terraform.
# Tạo 1 lần ở đây → không bao giờ bị chicken-and-egg.

resource "aws_iam_role" "infra_manager" {
  name = "intrepid-flow-infra-manager"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:hatuanduc/intrepid-flow:*"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "infra_manager_ec2" {
  role       = aws_iam_role.infra_manager.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2FullAccess"
}

resource "aws_iam_role_policy_attachment" "infra_manager_iam" {
  role       = aws_iam_role.infra_manager.name
  policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
}

resource "aws_iam_role_policy_attachment" "infra_manager_s3" {
  role       = aws_iam_role.infra_manager.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_role_policy_attachment" "infra_manager_cloudwatch" {
  role       = aws_iam_role.infra_manager.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# Needed to create/update the reconcile Lambda (infra/aws/modules/app/lambda-reconcile.tf)
resource "aws_iam_role_policy_attachment" "infra_manager_lambda" {
  role       = aws_iam_role.infra_manager.name
  policy_arn = "arn:aws:iam::aws:policy/AWSLambda_FullAccess"
}

resource "aws_iam_role_policy" "infra_manager_scheduler" {
  name = "infra-manager-scheduler"
  role = aws_iam_role.infra_manager.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["scheduler:*"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:*"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "*"
      }
    ]
  })
}

output "infra_manager_role_arn" {
  description = "Set làm AWS_INFRA_ROLE_ARN trong GitHub Actions (dùng cho infra job)"
  value       = aws_iam_role.infra_manager.arn
}
