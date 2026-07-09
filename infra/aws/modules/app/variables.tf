variable "env" {
  description = "Environment name: dev or prod"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be 'dev' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region"
  default     = "ap-southeast-1"
}

variable "app_name" {
  description = "Base application name"
  default     = "intrepid-flow"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  # dev: t4g.small (2GB), prod: t4g.medium (4GB)
}

variable "root_volume_size" {
  description = "EBS root volume size in GB"
  default     = 30
}

variable "schedule_enabled" {
  description = "Enable auto start/stop schedule (prod only)"
  type        = bool
  default     = false
}

variable "start_schedule" {
  description = "EventBridge cron to START the instance (UTC)"
  default     = "cron(0 1 ? * MON-FRI *)"  # 08:00 GMT+7 weekdays
}

variable "stop_schedule" {
  description = "EventBridge cron to STOP the instance (UTC)"
  default     = "cron(0 13 ? * MON-FRI *)"  # 20:00 GMT+7 weekdays
}

variable "github_repo" {
  description = "GitHub repo slug — owner/repo (e.g. acme/intrepid-flow)"
  type        = string
}

variable "deploy_bucket" {
  description = "S3 bucket used for deploy artifacts (can reuse Terraform state bucket)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID from shared module"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID from shared module — EC2 is placed here"
  type        = string
}

locals {
  name_prefix = "${var.app_name}-${var.env}"
}
