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
             └────────┬────────┘    └──────────┬──────────┘
                       │                        │
              EventBridge Scheduler   EventBridge Scheduler
              09:00–11:00 GMT+7       09:00–11:00 GMT+7
              (weekday)               (weekday)
```

Không có Elastic IP — public IP đổi mỗi lần start/stop. Mỗi lần boot, một systemd
service (`intrepid-dns-update.service`, cài trong `bootstrap.sh`) tự gọi Cloudflare
API cập nhật lại A record trỏ IP mới — xem `scripts/update-dns.sh` và mục 5e.

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
│   │   ├── main.tf           (t4g.small, weekday schedule 09:00–11:00 ICT)
│   │   ├── variables.tf
│   │   └── terraform.tfvars.example
│   └── prod/                 ← main branch → prod EC2
│       ├── main.tf           (t4g.medium, weekday schedule 09:00–11:00 ICT)
│       ├── variables.tf
│       └── terraform.tfvars.example
└── scripts/
    ├── bootstrap.sh          ← one-time EC2 setup (Docker + Nginx + DNS updater)
    ├── deploy.sh             ← called by CI via SSM Run Command
    ├── update-dns.sh         ← chạy mỗi lần boot, cập nhật A record Cloudflare (public IP đổi mỗi start)
    ├── setup-nginx.sh        ← one-time Nginx + Cloudflare Origin CA setup
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
| Schedule | Weekdays 09:00–11:00 ICT | Weekdays 09:00–11:00 ICT |
| EC2 compute | ~$1/tháng (2h/ngày) | ~$2/tháng (2h/ngày) |
| EBS 30GB | $2.40 | $2.40 |
| **Tổng** | **~$3–4/tháng** | **~$4–5/tháng** |

Không còn Elastic IP (~$3.6/tháng đã bỏ) — public IP đổi mỗi lần start, tự cập nhật
DNS qua `update-dns.sh`.

## Branch → Environment mapping

| Branch | GitHub Environment | EC2 |
|---|---|---|
| `develop` | `development` | Dev EC2 (public IP đổi mỗi lần start) |
| `main` | `production` | Prod EC2 (public IP đổi mỗi lần start) |

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
terraform init
terraform apply
terraform output instance_id   # → lưu lại là EC2_INSTANCE_ID (dev)

# PROD
cd infra/aws/environments/prod
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
terraform output instance_id   # → lưu lại là EC2_INSTANCE_ID (prod)
```

Không còn output `elastic_ip` — public IP đổi mỗi lần start/stop (`terraform output public_ip`
chỉ để tham khảo tức thời, không dùng để lưu cố định). Truy cập EC2 luôn qua SSM Session
Manager bằng `instance_id`, không qua IP.

Bootstrap chạy tự động trong EC2 User Data (~3 phút). Theo dõi progress:
```bash
# Sau khi EC2 đã running (~1 phút) — dùng SSM thay SSH
INSTANCE_ID=$(cd infra/aws/environments/prod && terraform output -raw instance_id)
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1
# Trong session: tail -f /var/log/bootstrap.log
```

### Bước 3 — Tạo .env trên từng EC2

```bash
INSTANCE_ID=$(cd infra/aws/environments/dev && terraform output -raw instance_id)  # hoặc prod
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1

# Tạo /app/.env (docker-compose đọc file này tự động)
cat > /app/.env <<'EOF'
DB_PASSWORD=<random_strong_password>
JWT_SECRET=<random_64_char_string>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=gmail_app_password
SMTP_FROM=your@gmail.com

# Dev: dev-intrepid.naronx.asia / api-dev-intrepid.naronx.asia
# Prod: intrepid.naronx.asia / api-intrepid.naronx.asia
APP_URL=https://dev-intrepid.naronx.asia
NEXT_PUBLIC_API_BASE_URL=https://api-dev-intrepid.naronx.asia

# HSBCNET_URL: mặc định HSBCnet thật (SSM param do terraform tạo sẵn giá trị này).
# Dev khi cần test pipeline với mock thì tạm đổi:
#   aws ssm put-parameter --name "/intrepid/dev/HSBCNET_URL" \
#     --value "https://dev-intrepid.naronx.asia/mock-hsbc" --type String --overwrite --region ap-southeast-1
# rồi deploy lại; test xong đổi về https://www1.secure.hsbcnet.com.
HSBCNET_URL=https://www1.secure.hsbcnet.com
EOF

chmod 600 /app/.env
```

### Bước 4 — Deploy lần đầu

Push code lên `develop` hoặc `main` → GitHub Actions sẽ tự động rsync + build + start.

### Bước 4b — Seed admin user (chạy 1 lần, sau lần deploy đầu tiên)

Set mật khẩu admin trong SSM **trước** khi seed (thay `PLACEHOLDER` do Terraform tạo):

```bash
aws ssm put-parameter --name "/intrepid/prod/SEED_ADMIN_PASSWORD" \
  --value "<random_strong_password>" --type SecureString --overwrite --region ap-southeast-1
```

Deploy lại 1 lần (hoặc đợi lần deploy kế tiếp) để `deploy.sh` pull giá trị này vào `/app/.env`, rồi seed thủ công qua SSM session:

```bash
INSTANCE_ID=$(cd infra/aws/environments/prod && terraform output -raw instance_id)
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1

cd /app
docker compose -f docker-compose.prod.yml run --rm migrate pnpm db:seed
```

Chỉ cần chạy **1 lần duy nhất** cho mỗi môi trường (dev/prod). Sau đó admin đăng nhập bằng mật khẩu vừa set — **không** re-run seed sau khi admin đã đổi mật khẩu qua app, vì seed sẽ ghi đè lại password về giá trị trong SSM.

Hoặc chạy thủ công lần đầu (qua SSM session ở Bước 3):
```bash
cd /app && bash infra/aws/scripts/deploy.sh
```

**First deploy sẽ mất 10–20 phút** (Docker build api + web + worker với Playwright).
Các lần sau dùng layer cache: ~2–5 phút.

### Bước 5 — Nginx + SSL (Cloudflare)

Traffic đi: **Browser → Cloudflare (proxy) → nginx :443 trên EC2 → app**. SSL giữa
Cloudflare và EC2 dùng **Cloudflare Origin CA cert** (miễn phí, 15 năm, không cần renew)
— **không dùng certbot**.

Domains (subdomain 1 cấp — Universal SSL của Cloudflare chỉ cover `*.naronx.asia` 1 cấp):

| Env | Web | API |
|---|---|---|
| dev | `dev-intrepid.naronx.asia` | `api-dev-intrepid.naronx.asia` |
| prod | `intrepid.naronx.asia` | `api-intrepid.naronx.asia` |

**5a. Tạo Origin CA cert và đẩy lên SSM (1 lần, dùng chung dev + prod):**
Cloudflare dashboard → zone `naronx.asia` → SSL/TLS → Origin Server → Create Certificate
→ hostnames: `naronx.asia`, `*.naronx.asia` → validity 15 years.
Lưu cert/key ra 2 file tạm rồi đẩy lên SSM (từ máy local, xóa file tạm sau khi xong):

```bash
aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_CERT" \
  --value file://origin.pem --type SecureString --overwrite --region ap-southeast-1
aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_KEY" \
  --value file://origin.key --type SecureString --overwrite --region ap-southeast-1
rm origin.pem origin.key
```

(2 param này do `infra/aws/shared` terraform tạo sẵn PLACEHOLDER — nằm ở path `shared/`
thay vì `{env}/` để không bị deploy.sh đổ PEM nhiều dòng vào `/app/.env`.)

**5b. Chạy setup script trên EC2** (script tự pull cert từ SSM → `/etc/ssl/cloudflare/`,
render config, reload nginx):

```bash
INSTANCE_ID=$(cd infra/aws/environments/dev && terraform output -raw instance_id)
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1

sudo bash /app/infra/aws/scripts/setup-nginx.sh dev    # hoặc: prod
```

**5c. Cloudflare DNS + SSL mode:**
- DNS: thêm 2 record `A` (web + api domain) trỏ tạm về `terraform output public_ip` hiện tại,
  **Proxy status: Proxied** (mây cam). Không còn Elastic IP nên IP này chỉ đúng cho tới lần
  start kế tiếp — record chỉ cần **tồn tại** (đúng tên), giá trị sẽ tự sửa bởi `update-dns.sh`
  (xem 5e) mỗi lần EC2 start.
- SSL/TLS → Overview → mode: **Full (strict)**

**5d. Cập nhật SSM params** (deploy.sh generate `/app/.env` từ đây mỗi lần deploy):

```bash
# dev
aws ssm put-parameter --name "/intrepid/dev/APP_URL" \
  --value "https://dev-intrepid.naronx.asia" --type String --overwrite --region ap-southeast-1
aws ssm put-parameter --name "/intrepid/dev/NEXT_PUBLIC_API_BASE_URL" \
  --value "https://api-dev-intrepid.naronx.asia" --type String --overwrite --region ap-southeast-1

# prod
aws ssm put-parameter --name "/intrepid/prod/APP_URL" \
  --value "https://intrepid.naronx.asia" --type String --overwrite --region ap-southeast-1
aws ssm put-parameter --name "/intrepid/prod/NEXT_PUBLIC_API_BASE_URL" \
  --value "https://api-intrepid.naronx.asia" --type String --overwrite --region ap-southeast-1
```

Sau đó **deploy lại** để web build lại với `NEXT_PUBLIC_API_BASE_URL` mới (build arg, bake vào bundle).

**5e. Cloudflare DNS auto-update (bắt buộc — không có Elastic IP nữa):**

Tạo API token trên Cloudflare (1 lần, dùng chung dev + prod):
`My Profile → API Tokens → Create Token` → quyền `Zone.DNS:Edit` cho zone `naronx.asia`.
Lấy Zone ID ở `Overview` của zone đó (cột phải). Đẩy 2 giá trị lên SSM:

```bash
aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_API_TOKEN" \
  --value "<token>" --type SecureString --overwrite --region ap-southeast-1
aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_ZONE_ID" \
  --value "<zone_id>" --type String --overwrite --region ap-southeast-1
```

`bootstrap.sh` tự cài + enable service `intrepid-dns-update.service` cho **EC2 tạo mới**
(chạy `update-dns.sh` mỗi lần boot). Với EC2 **đã tồn tại từ trước** (user_data không tự
chạy lại), cài thủ công 1 lần qua SSM session:

```bash
INSTANCE_ID=$(cd infra/aws/environments/dev && terraform output -raw instance_id)  # hoặc prod
aws ssm start-session --target $INSTANCE_ID --region ap-southeast-1

sudo apt-get install -y jq
sudo tee /etc/systemd/system/intrepid-dns-update.service > /dev/null <<'UNIT'
[Unit]
Description=Update Cloudflare DNS A record with this instance's current public IP
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash /app/infra/aws/scripts/update-dns.sh

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now intrepid-dns-update.service
```

Log: `/var/log/update-dns.log`. Kiểm tra nhanh: `sudo systemctl status intrepid-dns-update.service`.

### Bước 5b — Google OAuth (Sign in with Google)

1. Google Cloud Console → APIs & Services → Credentials → **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000` (dev local) + domain thật của từng env
     (vd `https://dev-intrepid.naronx.asia`, sau này thêm `https://intrepid.naronx.asia`)
   - **Không cần** Authorized redirect URIs, không cần client secret — dùng Google Identity
     Services (GIS) ID-token flow, không phải authorization-code flow
2. Copy **Client ID**, set vào SSM (1 param dùng chung cho cả api verify token lẫn web build arg):

```bash
aws ssm put-parameter --name "/intrepid/dev/GOOGLE_CLIENT_ID" \
  --value "xxxx.apps.googleusercontent.com" --type String --overwrite --region ap-southeast-1
```

3. Deploy lại — web build với `NEXT_PUBLIC_GOOGLE_CLIENT_ID` mới, api có `GOOGLE_CLIENT_ID` để verify.
4. Chỉ user **đã tồn tại trong hệ thống** (đã được admin invite, `isActive`) mới login Google được —
   không có self-signup. Nếu thêm domain mới sau này (vd prod), nhớ quay lại bước 1 thêm origin.

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

## Start/stop EC2 thủ công

Dev + prod đều đã có schedule tự động (weekdays 09:00–11:00 ICT — xem `scheduler.tf`).
Ngoài giờ đó cần dùng thủ công:

```bash
aws ec2 start-instances --instance-ids <INSTANCE_ID> --region ap-southeast-1
aws ec2 stop-instances  --instance-ids <INSTANCE_ID> --region ap-southeast-1

# Hoặc qua AWS Console → EC2 → Instances
```

Start thủ công cũng trigger `intrepid-dns-update.service` bình thường (systemd, không
phụ thuộc EventBridge) — DNS vẫn tự cập nhật đúng IP mới.
