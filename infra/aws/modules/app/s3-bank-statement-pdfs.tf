# S3 mirror of the transaction PDFs the bank-sync worker uploads to Google Drive (see
# apps/worker/src/bank-sync/services/drive.service.ts) — Drive is the primary, admin-facing
# archive (folder hierarchy by account/year/month/day); this bucket exists purely so the app
# itself can stream a PDF back when a user clicks the "view PDF" icon in Metrics/Job Detail,
# without depending on the Drive folder's sharing permissions. Mirrors the reconcile bucket's
# shape exactly (aws_s3_bucket.reconcile in lambda-reconcile.tf) — same module, same conventions.
#
# No lifecycle expiration (unlike reconcile's 1-day rule) — these PDFs are meant to stay
# viewable in the app indefinitely, not just for the duration of a single processing job.

resource "aws_s3_bucket" "bank_statement_pdfs" {
  bucket = "${local.name_prefix}-bank-statement-pdfs"
}

resource "aws_s3_bucket_public_access_block" "bank_statement_pdfs" {
  bucket                  = aws_s3_bucket.bank_statement_pdfs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── EC2 role: worker uploads (PutObject), api reads back for the "view PDF" endpoint ──────────
resource "aws_iam_role_policy" "app_bank_statement_pdfs" {
  name = "${local.name_prefix}-ec2-bank-statement-pdfs"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "${aws_s3_bucket.bank_statement_pdfs.arn}/*"
    }]
  })
}

# ── Config surfaced to the EC2 app via SSM (picked up into /app/.env by deploy.sh) ────────────
resource "aws_ssm_parameter" "bank_statement_pdf_bucket" {
  name        = "/intrepid/${var.env}/BANK_STATEMENT_PDF_BUCKET"
  description = "S3 bucket apps/worker uploads transaction PDFs to (Drive mirror) and apps/api reads back for in-app viewing"
  type        = "String"
  value       = aws_s3_bucket.bank_statement_pdfs.bucket
}
