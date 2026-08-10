# AWS Infrastructure Decisions

Ghi lại các quyết định kiến trúc để tham khảo về sau.

---

## Region

**Chọn: `ap-southeast-1` (Singapore)**

- AWS Hanoi (`ap-southeast-1-han-1a`) là Local Zone, không phải full region
- Lambda, EventBridge, SSM không khả dụng ở Local Zone → không dùng được
- Singapore latency từ VN ~20–30ms, chấp nhận được

---

## Compute: EC2 thay vì ECS / Cloud Run

**Chọn: EC2 t4g.medium (ARM Graviton2, 2 vCPU, 4GB RAM)**

- Worker dùng Playwright/Chromium: cần ~400–600MB RAM per instance → t4g.small (2GB) không đủ cho prod
- t4g.medium đủ chạy: NestJS API + Next.js + Worker + PostgreSQL + Redis
- Dev dùng t4g.small (2GB) để tiết kiệm

Không dùng ECS vì thêm phức tạp không cần thiết ở scale hiện tại.

---

## Networking

**VPC: 1 VPC dùng chung cho prod + dev**

- CIDR: `10.0.0.0/16`
- Public subnet: `10.0.1.0/24` (prod EC2 + dev EC2)
- Private subnet: `10.0.10.0/24` (dự phòng: RDS, ElastiCache)
- Không chia subnet theo env — Security Group đảm nhiệm isolation

**Không dùng NAT Gateway** (~$32/tháng)

- EC2 nằm trong public subnet, ra internet qua IGW trực tiếp
- NAT chỉ cần nếu EC2 ở private subnet

**Không dùng Elastic IP (cập nhật 2026-08-10)**

- Subnet có `map_public_ip_on_launch = true` → EC2 tự nhận public IP mỗi lần start,
  không cần EIP tĩnh. Tiết kiệm ~$3.6/tháng/instance.
- Đánh đổi: public IP đổi mỗi lần start/stop → cần tự cập nhật Cloudflare DNS.
  Giải quyết bằng `infra/aws/scripts/update-dns.sh` — systemd service chạy mỗi lần
  boot (cài trong `bootstrap.sh`), gọi Cloudflare API PATCH A record bằng token lưu ở
  SSM `/intrepid/shared/CLOUDFLARE_API_TOKEN`.
- Instance đã tồn tại từ trước (bootstrap.sh không tự chạy lại) cần cài service này
  thủ công 1 lần — xem README.md Bước 5e.

**Nginx thay vì ALB** (~$16/tháng)

- ALB chỉ có ý nghĩa khi scale ≥2 EC2 hoặc cần Auto Scaling
- Nginx chạy trên EC2, miễn phí, đủ dùng

---

## Terraform State

| Module | Backend | Lý do |
|---|---|---|
| `bootstrap/` | Local (commit git) | Chicken-and-egg: chưa có S3 để lưu state |
| `shared/` | S3: `intrepid-terraform-state/shared/terraform.tfstate` | Remote |
| `environments/prod/` | S3: `intrepid-terraform-state/prod/terraform.tfstate` | Remote |
| `environments/dev/` | S3: `intrepid-terraform-state/dev/terraform.tfstate` | Remote |

**Plan trước khi apply:**
```bash
terraform plan -out=tfplan
terraform apply tfplan
```

---

## Tagging

Dùng `default_tags` trong `provider "aws"` — tự động merge vào mọi resource, không replace tag riêng (resource tag thắng nếu trùng key).

```hcl
provider "aws" {
  default_tags {
    tags = {
      Project     = "intrepid-flow"
      Environment = "prod"   # hoặc "dev"; bỏ tag này trong shared/
      ManagedBy   = "terraform"
    }
  }
}
```

Dùng AWS Cost Explorer → filter `Project = intrepid-flow` để theo dõi chi phí.

---

## VPC Peering (tương lai)

Hiện tại: mỗi project có `shared/` riêng trong repo của nó — đơn giản, độc lập.

Khi cần VPC peering giữa các project: tạo repo `infra-account` riêng chứa tất cả VPC + peering, các project đọc qua `terraform_remote_state`.

---

## Chi phí ước tính

- EC2 t4g.medium, schedule 09:00–11:00 GMT+7 weekdays (~2h/ngày, 22 ngày): ~$2/tháng
- EBS gp3 30GB: ~$2.40/tháng
- Không còn Elastic IP (xem mục Networking) — tiết kiệm ~$3.6/tháng
- **Tổng: ~$4–5/tháng** (prod); dev tương tự với t4g.small
