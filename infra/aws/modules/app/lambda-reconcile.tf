# Reconcile "filter-merge" Lambda — offloads the memory-heavy invoice-parsing step (previously a
# forked child process on the EC2 host, capped at 2GB and still not enough headroom for larger
# invoice files) to its own Lambda so a single reconcile run can't threaten web/api/worker/db/redis
# sharing the same 4GB EC2 host. Runs a few times a month, so this sits comfortably inside AWS's
# always-free Lambda tier (400,000 GB-seconds/month) even at 6GB memory.
#
# Stateless: apps/api resolves ReconcileSettings + Master Customer map from Postgres and passes
# them in the invoke payload, so this function never needs VPC access to reach the EC2-hosted
# Postgres, and never writes to it either — see apps/reconcile-lambda/src/handler.ts.

resource "aws_s3_bucket" "reconcile" {
  bucket = "${local.name_prefix}-reconcile"
}

resource "aws_s3_bucket_lifecycle_configuration" "reconcile" {
  bucket = aws_s3_bucket.reconcile.id

  rule {
    id     = "expire-after-1-day"
    status = "Enabled"
    filter {}
    expiration { days = 1 }
  }
}

resource "aws_s3_bucket_public_access_block" "reconcile" {
  bucket                  = aws_s3_bucket.reconcile.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Lambda execution role ──────────────────────────────────────────────────
resource "aws_iam_role" "reconcile_lambda" {
  name = "${local.name_prefix}-reconcile-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "reconcile_lambda_logs" {
  role       = aws_iam_role.reconcile_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "reconcile_lambda_s3" {
  name = "${local.name_prefix}-reconcile-lambda-s3"
  role = aws_iam_role.reconcile_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "${aws_s3_bucket.reconcile.arn}/*"
    }]
  })
}

# ── Lambda function ────────────────────────────────────────────────────────
# Code artifact: run `pnpm --filter @intrepid/reconcile-lambda build` before `terraform apply` —
# bundles src/handler.ts (+ deps except @aws-sdk/*, provided by the Lambda runtime) into a single
# dist/index.js via esbuild. source_code_hash below picks up any change automatically.
data "archive_file" "reconcile_lambda" {
  type        = "zip"
  source_file = "${path.module}/../../../../apps/reconcile-lambda/dist/index.js"
  output_path = "${path.module}/../../../../apps/reconcile-lambda/dist/function.zip"
}

resource "aws_lambda_function" "reconcile" {
  function_name    = "${local.name_prefix}-reconcile"
  role             = aws_iam_role.reconcile_lambda.arn
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.reconcile_lambda.output_path
  source_code_hash = data.archive_file.reconcile_lambda.output_base64sha256

  # Sized from the old per-file child process cap (2048MB was already tight for a ~29MB file) —
  # 3008MB is this account's current Lambda memory quota ceiling (new AWS accounts default here;
  # request a Service Quotas increase to raise it, then bump this back toward 6144 for more
  # headroom on ~50MB files). Lambda scales CPU with memory, so this also parses faster.
  memory_size = 3008
  timeout     = 600                 # 10 min — each file is read twice (pass 1 aggregate, pass 2 stream to output)
  ephemeral_storage { size = 2048 } # holds downloaded input files + the output .xlsx in /tmp
}

# ── EC2 role: invoke the Lambda + read/write the reconcile bucket ─────────────
resource "aws_iam_role_policy" "app_reconcile" {
  name = "${local.name_prefix}-ec2-reconcile"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.reconcile.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.reconcile.arn}/*"
      }
    ]
  })
}

# ── Config surfaced to the EC2 app via SSM (picked up into /app/.env by deploy.sh) ────────────
resource "aws_ssm_parameter" "reconcile_bucket" {
  name        = "/intrepid/${var.env}/RECONCILE_BUCKET"
  description = "S3 bucket the reconcile Lambda reads/writes invoice files from"
  type        = "String"
  value       = aws_s3_bucket.reconcile.bucket
}

resource "aws_ssm_parameter" "reconcile_lambda_name" {
  name        = "/intrepid/${var.env}/RECONCILE_LAMBDA_NAME"
  description = "Function name apps/api invokes to run the reconcile filter-merge job"
  type        = "String"
  value       = aws_lambda_function.reconcile.function_name
}

resource "aws_ssm_parameter" "aws_region" {
  name        = "/intrepid/${var.env}/AWS_REGION"
  description = "Region for the AWS SDK clients in apps/api (S3 + Lambda invoke for reconcile) — not auto-detected on EC2"
  type        = "String"
  value       = var.aws_region
}
