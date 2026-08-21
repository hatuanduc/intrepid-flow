terraform {
  required_version = ">= 1.7"

  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }

  backend "s3" {
    bucket = "intrepid-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = {
      Project     = "intrepid-flow"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

# Đọc VPC/subnet IDs từ shared module (infra/aws/shared/)
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = "intrepid-terraform-state"
    key    = "shared/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

module "app" {
  source = "../../modules/app"

  env           = "dev"
  instance_type = "t4g.medium" # 4GB — cần cho Playwright + 3 apps + Redis + PG

  vpc_id    = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_id = data.terraform_remote_state.shared.outputs.public_subnet_id

  # Dev: 2 khung giờ chạy trong ngày (9h-10h, 16h40-17h30 ICT) + 1 lần stop an toàn
  # lúc 19h ICT (đề phòng ai bật thêm ngoài 2 khung giờ trên mà quên tắt lại).
  start_schedule_enabled = true
  start_schedules = [
    "cron(0 2 ? * MON-FRI *)",  # 09:00 ICT (UTC+7)
    "cron(40 9 ? * MON-FRI *)", # 16:40 ICT (UTC+7)
  ]
  stop_schedule_enabled = true
  stop_schedules = [
    "cron(0 3 ? * MON-FRI *)",   # 10:00 ICT (UTC+7)
    "cron(30 10 ? * MON-FRI *)", # 17:30 ICT (UTC+7)
    "cron(0 12 ? * MON-FRI *)",  # 19:00 ICT (UTC+7) — safety net
  ]

  github_repo   = "hatuanduc/intrepid-flow"
  deploy_bucket = "intrepid-terraform-state"
}

output "public_ip" { value = module.app.public_ip }
output "instance_id" { value = module.app.instance_id }
output "ssm_command" { value = module.app.ssm_command }
output "github_actions_role_arn" { value = module.app.github_actions_role_arn }
output "reconcile_bucket" { value = module.app.reconcile_bucket }
output "reconcile_lambda_name" { value = module.app.reconcile_lambda_name }
