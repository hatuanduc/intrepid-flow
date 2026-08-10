output "public_ip" {
  description = "Current public IP — thay đổi mỗi lần start/stop (không còn Elastic IP). Nginx/Cloudflare DNS được tự cập nhật bởi update-dns.sh (chạy mỗi lần boot), không cần đọc output này cho mục đích đó."
  value       = aws_instance.app.public_ip
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

output "reconcile_bucket" {
  description = "S3 bucket for the reconcile Lambda — copy into RECONCILE_BUCKET in your local .env to test against this env's real Lambda"
  value       = aws_s3_bucket.reconcile.bucket
}

output "reconcile_lambda_name" {
  description = "Lambda function name — copy into RECONCILE_LAMBDA_NAME in your local .env"
  value       = aws_lambda_function.reconcile.function_name
}
