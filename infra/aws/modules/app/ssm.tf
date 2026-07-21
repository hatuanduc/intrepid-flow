# SSM Parameter Store — structure managed by Terraform, values set manually.
#
# Sau khi terraform apply, set giá trị thật:
#   aws ssm put-parameter --name "/intrepid/prod/DB_PASSWORD" \
#     --value "..." --type SecureString --overwrite
#
# deploy.sh sẽ pull toàn bộ /intrepid/{env}/ và ghi ra /app/.env

# ── Secrets (SecureString) ────────────────────────────────────────────────────

resource "aws_ssm_parameter" "db_password" {
  name        = "/intrepid/${var.env}/DB_PASSWORD"
  description = "PostgreSQL password"
  type        = "SecureString"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/intrepid/${var.env}/JWT_SECRET"
  description = "JWT signing secret (min 64 chars random)"
  type        = "SecureString"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "smtp_pass" {
  name        = "/intrepid/${var.env}/SMTP_PASS"
  description = "Gmail App Password for SMTP"
  type        = "SecureString"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "seed_admin_password" {
  name        = "/intrepid/${var.env}/SEED_ADMIN_PASSWORD"
  description = "Initial admin password — chỉ dùng 1 lần khi chạy `pnpm db:seed` thủ công lần đầu, xem infra/aws/README.md"
  type        = "SecureString"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

# ── Config (String, env-specific) ────────────────────────────────────────────

resource "aws_ssm_parameter" "app_url" {
  name        = "/intrepid/${var.env}/APP_URL"
  description = "Public app URL (e.g. https://app.example.com)"
  type        = "String"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "api_base_url" {
  name        = "/intrepid/${var.env}/NEXT_PUBLIC_API_BASE_URL"
  description = "API base URL baked into Next.js image at build time"
  type        = "String"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "hsbcnet_url" {
  name        = "/intrepid/${var.env}/HSBCNET_URL"
  description = "HSBCnet portal URL cho bank-sync worker — mặc định HSBCnet thật; dev có thể tạm đổi sang mock-hsbc khi cần test pipeline"
  type        = "String"
  value       = "https://www1.secure.hsbcnet.com"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "smtp_user" {
  name        = "/intrepid/${var.env}/SMTP_USER"
  description = "Gmail address used to send email"
  type        = "String"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "smtp_from" {
  name        = "/intrepid/${var.env}/SMTP_FROM"
  description = "From address in sent emails"
  type        = "String"
  value       = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}
