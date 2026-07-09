terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
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
  instance_type = "t4g.small"   # 2GB — đủ cho dev, tiết kiệm hơn prod

  vpc_id    = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_id = data.terraform_remote_state.shared.outputs.public_subnet_id

  # Staging: không có schedule — start/stop thủ công khi cần
  schedule_enabled = false

  github_repo   = "hatuanduc/intrepid-flow"
  deploy_bucket = "intrepid-terraform-state"
}

output "elastic_ip"  { value = module.app.elastic_ip }
output "instance_id" { value = module.app.instance_id }
output "ssm_command" { value = module.app.ssm_command }
output "github_actions_role_arn" { value = module.app.github_actions_role_arn }
