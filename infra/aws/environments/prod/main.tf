terraform {
  required_version = ">= 1.7"

  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }

  backend "s3" {
    bucket = "intrepid-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = {
      Project     = "intrepid-flow"
      Environment = "prod"
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

  env           = "prod"
  instance_type = "t4g.medium" # 4GB — cần cho Playwright + 3 apps + Redis + PG

  vpc_id    = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_id = data.terraform_remote_state.shared.outputs.public_subnet_id

  # Prod: start 08:00 GMT+7, stop 20:00 GMT+7 (weekdays)
  start_schedule_enabled = true
  stop_schedule_enabled  = true
  start_schedule         = "cron(0 1 ? * MON-FRI *)"
  stop_schedule          = "cron(0 13 ? * MON-FRI *)"

  github_repo   = "hatuanduc/intrepid-flow"
  deploy_bucket = "intrepid-terraform-state"
}

output "elastic_ip" { value = module.app.elastic_ip }
output "instance_id" { value = module.app.instance_id }
output "ssm_command" { value = module.app.ssm_command }
output "github_actions_role_arn" { value = module.app.github_actions_role_arn }
output "reconcile_bucket" { value = module.app.reconcile_bucket }
output "reconcile_lambda_name" { value = module.app.reconcile_lambda_name }
