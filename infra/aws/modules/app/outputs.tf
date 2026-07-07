output "elastic_ip" {
  description = "Static public IP (for manual SSH and Nginx reference)"
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "EC2 instance ID — save as EC2_INSTANCE_ID GitHub Environment variable"
  value       = aws_instance.app.id
}

output "github_actions_role_arn" {
  description = "IAM role ARN — save as AWS_ROLE_ARN GitHub Environment variable"
  value       = aws_iam_role.github_actions.arn
}

output "ssm_command" {
  description = "Manual shell access — no SSH needed"
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ap-southeast-1"
}
