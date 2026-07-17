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

  # Dev: không auto-start (start thủ công khi cần), nhưng luôn auto-stop 18:00 ICT
  # để phòng quên tắt máy
  start_schedule_enabled = false
  stop_schedule_enabled  = true
  stop_schedule          = "cron(0 11 * * ? *)" # 18:00 ICT (UTC+7) hàng ngày

  github_repo   = "hatuanduc/intrepid-flow"
  deploy_bucket = "intrepid-terraform-state"
}

output "elastic_ip" { value = module.app.elastic_ip }
output "instance_id" { value = module.app.instance_id }
output "ssm_command" { value = module.app.ssm_command }
output "github_actions_role_arn" { value = module.app.github_actions_role_arn }
