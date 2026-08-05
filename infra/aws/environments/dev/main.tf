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

  # Dev: auto-start 09:00 ICT, auto-stop 18:00 ICT (weekdays only, giống prod)
  start_schedule_enabled = true
  start_schedule         = "cron(0 2 ? * MON-FRI *)" # 09:00 ICT (UTC+7)
  stop_schedule_enabled  = true
  stop_schedule          = "cron(0 11 ? * MON-FRI *)" # 18:00 ICT (UTC+7)

  github_repo   = "hatuanduc/intrepid-flow"
  deploy_bucket = "intrepid-terraform-state"
}

output "elastic_ip" { value = module.app.elastic_ip }
output "instance_id" { value = module.app.instance_id }
output "ssm_command" { value = module.app.ssm_command }
output "github_actions_role_arn" { value = module.app.github_actions_role_arn }
output "reconcile_bucket" { value = module.app.reconcile_bucket }
output "reconcile_lambda_name" { value = module.app.reconcile_lambda_name }
