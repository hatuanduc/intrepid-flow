# infra (GCP)

Mục tiêu: deploy 2 service (web + api) lên Google Cloud Run bằng Terraform, và release qua GitHub Actions.

## Prerequisites

- GCP Project + billing
- Enable APIs: Cloud Run, Artifact Registry, IAM
- Terraform 1.6+

## Terraform (local)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# sửa project_id, region, ...
terraform init
terraform apply
```

## CI/CD (GitHub Actions)

Workflow tạo image và deploy bằng Terraform: `.github/workflows/deploy-gcp.yml`.

## Thiết lập chi phí thấp (dev)

Khuyến nghị để giảm chi phí khi chỉ dev/ít request:

- Cloud Run: `min instances = 0`
- Cloud Run: `max instances = 1` (cap chi phí)
- API: `256Mi` RAM
- Web: `512Mi` RAM

Các default trên đã được set trong Terraform variables (`min_instances`, `max_instances`, `api_memory`, `web_memory`).
Nếu bạn deploy bằng đường **không Terraform** trong workflow (khi không set `TF_STATE_BUCKET`) thì workflow cũng deploy với các default tương tự.

## Cảnh báo chi phí (Budget alert)

Để cảnh báo khi chi phí tăng lên mức “vài chục nghìn VND”, cách nhanh nhất là tạo **Budget** trên Billing:

1) Google Cloud Console → **Billing** → **Budgets & alerts**
2) **Create budget**
3) Scope: chọn project `intrepid-...`
4) Amount: set khoảng tương đương **50,000–100,000 VND** (tuỳ currency của Billing account; nhiều account dùng USD)
5) Alerts: bật ngưỡng 50% / 90% / 100% và chọn email nhận thông báo

Gợi ý: nếu Billing account dùng USD, bạn có thể đặt budget nhỏ (vd `$3`–`$5`) để tương đương “vài chục nghìn VND”, rồi điều chỉnh sau.

### Bắt buộc: Terraform remote state (GCS bucket)

CI chạy `terraform apply` cần state ổn định. Hãy tạo 1 GCS bucket để lưu state.

Lưu ý: cú pháp biến môi trường khác nhau tuỳ shell:

- Bash/Cloud Shell: dùng `$PROJECT_ID`
- PowerShell: dùng `$env:PROJECT_ID`
- CMD (Google Cloud SDK Shell): dùng `%PROJECT_ID%`

**Bash / Cloud Shell**

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"
export TF_STATE_BUCKET="${PROJECT_ID}-intrepid-tfstate"

gcloud config set project "$PROJECT_ID"
gcloud storage buckets create "gs://${TF_STATE_BUCKET}" --location="$REGION"
gcloud storage buckets update "gs://${TF_STATE_BUCKET}" --uniform-bucket-level-access
```

**PowerShell (Windows)**

```powershell
$env:PROJECT_ID = "your-gcp-project-id"
$env:REGION = "asia-southeast1"
$env:TF_STATE_BUCKET = "$($env:PROJECT_ID)-intrepid-tfstate"

gcloud config set project $env:PROJECT_ID
gcloud storage buckets create "gs://$env:TF_STATE_BUCKET" --location=$env:REGION
gcloud storage buckets update "gs://$env:TF_STATE_BUCKET" --uniform-bucket-level-access
```

**CMD (Google Cloud SDK Shell)**

```bat
set PROJECT_ID=your-gcp-project-id
set REGION=asia-southeast1
set TF_STATE_BUCKET=%PROJECT_ID%-intrepid-tfstate

gcloud config set project %PROJECT_ID%
gcloud storage buckets create gs://%TF_STATE_BUCKET% --location=%REGION%
gcloud storage buckets update gs://%TF_STATE_BUCKET% --uniform-bucket-level-access
```

Sau đó set GitHub secret `TF_STATE_BUCKET` đúng bucket name ở trên.

### Secrets cần set trên GitHub

Luôn cần:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `TF_STATE_BUCKET`

Tuỳ chọn:

- `GCP_ARTIFACT_REPO` (default: `intrepid`)
- `CORS_ORIGIN`
- `JWT_SECRET`
- `DEMO_PASSWORD`

### Auth cho GitHub Actions

Workflow hỗ trợ 2 cách. Nếu bạn set `GCP_SA_KEY` thì workflow sẽ dùng **key JSON**; nếu không có thì dùng **WIF**.

#### Cách 1 (khuyến nghị): Workload Identity Federation (không dùng key)

Set secrets:

- `GCP_WIF_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

#### Cách 2 (nhanh): Service Account Key JSON

1) Tạo service account deploy:

Ví dụ Bash:

```bash
export PROJECT_ID="<your-project-id>"
export SA_NAME="intrepid-deployer"

gcloud config set project "$PROJECT_ID"
gcloud iam service-accounts create "$SA_NAME" --display-name="intrepid deployer"
```

Ví dụ CMD:

```bat
set PROJECT_ID=<your-project-id>
set SA_NAME=intrepid-deployer

gcloud config set project %PROJECT_ID%
gcloud iam service-accounts create %SA_NAME% --display-name="intrepid deployer"
```

2) Gán quyền (mức đơn giản để chạy Terraform + deploy Cloud Run + push Artifact Registry):

```bash
export SA_EMAIL="$SA_NAME@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
	--member="serviceAccount:$SA_EMAIL" \
	--role="roles/editor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
	--member="serviceAccount:$SA_EMAIL" \
	--role="roles/iam.securityAdmin"
```

Ghi chú: `roles/editor` + `roles/iam.securityAdmin` là set “dễ chạy” cho demo. Khi lên production nên siết quyền theo least-privilege.

3) Tạo key JSON và set lên GitHub secret `GCP_SA_KEY`:

```bash
gcloud iam service-accounts keys create key.json --iam-account "$SA_EMAIL"
```

Mở `key.json`, copy toàn bộ JSON và paste vào GitHub → Settings → Secrets and variables → Actions → New repository secret → `GCP_SA_KEY`.
