# Intrepid Flow — AWS Infrastructure

## Architecture

```
                    develop branch          main branch
                         │                      │
                GitHub Actions              GitHub Actions
                 (rsync + deploy)          (rsync + deploy)
                         │                      │
                         ▼                      ▼
             ┌─────────────────┐    ┌─────────────────────┐
             │  EC2 t4g.small  │    │   EC2 t4g.medium    │
             │  DEV (2GB RAM)  │    │   PROD (4GB RAM)    │
             │                 │    │                      │
             │  Nginx :80/443  │    │  Nginx :80/443       │
             │  ┌────────────┐ │    │  ┌────────────┐      │
             │  │  Docker    │ │    │  │  Docker    │      │
             │  │  Compose   │ │    │  │  Compose   │      │
             │  │  web :3000 │ │    │  │  web :3000 │      │
             │  │  api :4000 │ │    │  │  api :4000 │      │
             │  │  worker    │ │    │  │  worker    │      │
             │  │  postgres  │ │    │  │  postgres  │      │
             │  │  redis     │ │    │  │  redis     │      │
             │  └────────────┘ │    │  └────────────┘      │
             └─────────────────┘    └──────────┬──────────┘
              Manual start/stop                │
                                   EventBridge → Lambda
                                   08:00–20:00 GMT+7 (weekday)
```

**Build strategy:** Docker images are built ON the EC2 instance (not on GitHub runners). CI only rsyncs source code and triggers `docker compose up --build -d` via SSH.

## File structure

```
infra/aws/
├── modules/
│   └── app/                  ← reusable Terraform module
│       ├── variables.tf
│       ├── ec2.tf
│       ├── security_group.tf
│       ├── iam.tf
│       ├── scheduler.tf
│       └── outputs.tf
├── environments/
│   ├── dev/                  ← develop branch → dev EC2
│   │   ├── main.tf           (t4g.small, no schedule)
│   │   ├── variables.tf
│   │   └── terraform.tfvars.example
│   └── prod/                 ← main branch → prod EC2
│       ├── main.tf           (t4g.medium, weekday schedule)
│       ├── variables.tf
│       └── terraform.tfvars.example
└── scripts/
    ├── bootstrap.sh          ← one-time EC2 setup (Docker + Nginx)
    ├── deploy.sh             ← called by CI via SSH
    ├── ec2_scheduler.py      ← Lambda handler (start/stop)
    └── nginx.conf            ← Nginx template

docker-compose.prod.yml       ← Docker Compose (5 services: web/api/worker/db/redis)
apps/api/Dockerfile
apps/web/Dockerfile           (requires NEXT_PUBLIC_API_BASE_URL build arg)
apps/worker/Dockerfile        (includes Playwright + Chromium)
```

## Chi phí ước tính

| | Dev | Prod |
|---|---|---|
| Instance | t4g.small | t4g.medium |
| RAM | 2GB | 4GB |
| Schedule | Manual stop/start | Weekdays 08:00–20:00 |
| EC2 compute | ~$3–5/tháng | ~$10/tháng |
| EBS 30GB | $2.40 | $2.40 |
| **Tổng** | **~$5–8/tháng** | **~$12–13/tháng** |

## Branch → Environment mapping

| Branch | GitHub Environment | EC2 |
|---|---|---|
| `develop` | `development` | Dev EC2 (Elastic IP dev) |
| `main` | `production` | Prod EC2 (Elastic IP prod) |

## Manual setup (chạy 1 lần cho mỗi môi trường)

### Bước 0 — Bootstrap (1 lần duy nhất cho toàn bộ AWS account)

Tạo GitHub OIDC provider — dùng chung cho mọi project trong account này.
Nếu account đã có OIDC provider rồi thì **bỏ qua bước này**.

```bash
cd infra/aws/bootstrap
terraform init
terraform apply
# → Commit terraform.tfstate vào git (xác nhận đã tạo, không có data nhạy cảm)
git add terraform.tfstate && git commit -m "chore: bootstrap github oidc provider"
```

### Bước 1 — AWS prerequisites (1 lần duy nhất)

```bash
# Tạo IAM user "intrepid-deploy" với quyền (dùng để bootstrap + apply Terraform lần đầu):
# AmazonEC2FullAccess, IAMFullAccess, AWSLambda_FullAccess,
# AmazonS3FullAccess, CloudWatchEventsFullAccess
# → Lưu Access Key ID + Secret Access Key (chỉ dùng cho bootstrap, sau đó CI dùng OIDC)

# Tạo S3 bucket cho Terraform state
aws s3 mb s3://intrepid-terraform-state --region ap-southeast-1
aws s3api put-bucket-versioning \
  --bucket intrepid-terraform-state \
  --versioning-configuration Status=Enabled
```

Không cần SSH key — manual access qua SSM Session Manager.

### Bước 2 — Terraform (chạy riêng cho dev và prod)

```bash
# DEV
cd infra/aws/environments/dev
cp terraform.tfvars.example terraform.tfvars
# Điền ssh_public_key (nội dung ~/.ssh/intrepid_rsa.pub)
terraform init
terraform apply
terraform output elastic_ip   # → lưu lại là DEV_EC2_HOST

# PROD
cd infra/aws/environments/prod
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
terraform output elastic_ip   # → lưu lại là PROD_EC2_HOST
```

Bootstrap chạy tự động trong EC2 User Data (~3 phút). Theo dõi progress:
```bash
# Sau khi EC2 đã running (~1 phút) — dùng SSM thay SSH
INSTANCE_ID=$(cd infra/aws/environments/prod && terraform output -raw instance_id)
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1
# Trong session: tail -f /var/log/bootstrap.log
```

### Bước 3 — Tạo .env trên từng EC2

```bash
ssh -i ~/.ssh/intrepid_rsa ubuntu@<ELASTIC_IP>

# Tạo /app/.env (docker-compose đọc file này tự động)
cat > /app/.env <<'EOF'
DB_PASSWORD=<random_strong_password>
JWT_SECRET=<random_64_char_string>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=gmail_app_password
SMTP_FROM=your@gmail.com

APP_URL=https://dev.your-domain.com
NEXT_PUBLIC_API_BASE_URL=https://api.dev.your-domain.com
EOF

chmod 600 /app/.env
```

### Bước 4 — Deploy lần đầu

Push code lên `develop` hoặc `main` → GitHub Actions sẽ tự động rsync + build + start.

Hoặc chạy thủ công lần đầu:
```bash
ssh -i ~/.ssh/intrepid_rsa ubuntu@<ELASTIC_IP>
cd /app && bash infra/aws/scripts/deploy.sh
```

**First deploy sẽ mất 10–20 phút** (Docker build api + web + worker với Playwright).
Các lần sau dùng layer cache: ~2–5 phút.

### Bước 5 — Nginx + SSL

```bash
ssh -i ~/.ssh/intrepid_rsa ubuntu@<ELASTIC_IP>

# Copy Nginx config và sửa domain
sudo cp /app/infra/aws/scripts/nginx.conf /etc/nginx/sites-available/intrepid
sudo nano /etc/nginx/sites-available/intrepid   # điền domain thực tế
sudo ln -s /etc/nginx/sites-available/intrepid /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL (domain phải trỏ về Elastic IP trước)
sudo certbot --nginx -d dev.your-domain.com -d api.dev.your-domain.com
```

### Bước 6 — GitHub: tạo Environments và Secrets

```
GitHub → Settings → Environments → New environment: "development"
GitHub → Settings → Environments → New environment: "production"

Repository secrets: không cần thêm gì (SSH đã bị remove hoàn toàn)

Environment variables (không phải secrets — không nhạy cảm):
  development:
    AWS_ROLE_ARN       → terraform output -raw github_actions_role_arn  (dev module)
    EC2_INSTANCE_ID    → terraform output -raw instance_id              (dev module)

  production:
    AWS_ROLE_ARN       → terraform output -raw github_actions_role_arn  (prod module)
    EC2_INSTANCE_ID    → terraform output -raw instance_id              (prod module)
```

**Không còn cần:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EC2_SSH_PRIVATE_KEY` trong CI.
GitHub Actions dùng OIDC → IAM Role (temporary credentials, tự hết hạn sau 1h).

Note: `NEXT_PUBLIC_API_BASE_URL` is read from `/app/.env` on EC2 at Docker build time — không cần lưu trong GitHub secrets.

## Auto deploy (sau khi setup xong)

```
git push origin develop  →  rsync → docker compose up --build -d → Dev EC2   (~3–5 phút)
git push origin main     →  rsync → docker compose up --build -d → Prod EC2  (~3–5 phút)

Infra changes:
git push origin develop  →  terraform apply dev
git push origin main     →  terraform apply prod
```

## Quản lý Docker trên EC2

```bash
cd /app

# Xem trạng thái containers
docker compose -f docker-compose.prod.yml ps

# Xem logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker --tail 100

# Restart 1 service
docker compose -f docker-compose.prod.yml restart api

# Rebuild và restart 1 service (sau khi sửa code thủ công)
docker compose -f docker-compose.prod.yml up --build -d api

# Dừng tất cả
docker compose -f docker-compose.prod.yml down

# Dừng + xóa volumes (XÓA DATA - cẩn thận!)
docker compose -f docker-compose.prod.yml down -v
```

## Start/stop EC2 thủ công (dev)

```bash
# Dev không có schedule, start khi cần:
aws ec2 start-instances --instance-ids <DEV_INSTANCE_ID> --region ap-southeast-1
aws ec2 stop-instances  --instance-ids <DEV_INSTANCE_ID> --region ap-southeast-1

# Hoặc qua AWS Console → EC2 → Instances
```
