#!/bin/bash
# Cập nhật A record (web + api) trên Cloudflare trỏ về public IP hiện tại của EC2 này.
#
# EC2 không còn Elastic IP (đã bỏ để tiết kiệm chi phí — xem ec2.tf) nên public IP
# đổi mỗi lần start/stop. Script này chạy tự động mỗi lần boot qua systemd
# (intrepid-dns-update.service, cài trong bootstrap.sh) — không cần chạy tay.
#
# Yêu cầu:
#   - /app/.env đã tồn tại (deploy.sh ghi APP_ENV=dev|prod vào đây ở lần deploy đầu)
#   - SSM params /intrepid/shared/CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID đã set giá trị thật
set -euo pipefail
exec > >(tee -a /var/log/update-dns.log) 2>&1

echo "=== [update-dns] Start: $(date) ==="

REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"

# Chưa deploy lần nào thì chưa biết env — bỏ qua, lần start kế tiếp (sau deploy) sẽ chạy lại.
if [ ! -f /app/.env ]; then
  echo "[update-dns] /app/.env chưa tồn tại (chưa deploy lần nào) — bỏ qua."
  exit 0
fi
APP_ENV="$(grep -m1 '^APP_ENV=' /app/.env | cut -d= -f2 | tr -d '\r')"

case "$APP_ENV" in
  dev)  RECORD_NAMES=("dev-intrepid.naronx.asia" "api-dev-intrepid.naronx.asia") ;;
  prod) RECORD_NAMES=("intrepid.naronx.asia" "api-intrepid.naronx.asia") ;;
  *)
    echo "[update-dns] APP_ENV không hợp lệ trong /app/.env: '$APP_ENV'" >&2
    exit 1
    ;;
esac

# ── Public IP hiện tại qua IMDSv2 ────────────────────────────────────────────
TOKEN="$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60")"
PUBLIC_IP="$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)"

if [ -z "$PUBLIC_IP" ]; then
  echo "[update-dns] Không lấy được public IP từ metadata — bỏ qua." >&2
  exit 1
fi
echo "[update-dns] env=$APP_ENV public_ip=$PUBLIC_IP"

# ── Credentials từ SSM ────────────────────────────────────────────────────────
CF_TOKEN="$(aws ssm get-parameter --name "/intrepid/shared/CLOUDFLARE_API_TOKEN" \
  --with-decryption --region "$REGION" --query "Parameter.Value" --output text)"
ZONE_ID="$(aws ssm get-parameter --name "/intrepid/shared/CLOUDFLARE_ZONE_ID" \
  --region "$REGION" --query "Parameter.Value" --output text)"

if [ "$CF_TOKEN" = "PLACEHOLDER" ] || [ "$ZONE_ID" = "PLACEHOLDER" ]; then
  echo "[update-dns] CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID chưa được set giá trị thật — bỏ qua." >&2
  exit 1
fi

# ── Cập nhật từng A record ────────────────────────────────────────────────────
for NAME in "${RECORD_NAMES[@]}"; do
  RECORD_ID="$(curl -sf -X GET \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=$NAME" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    | jq -r '.result[0].id // empty')"

  if [ -z "$RECORD_ID" ]; then
    echo "[update-dns] WARNING: không tìm thấy A record cho $NAME trên Cloudflare — bỏ qua." >&2
    continue
  fi

  RESULT="$(curl -sf -X PATCH \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"content\":\"$PUBLIC_IP\"}" \
    | jq -r '.success')"

  if [ "$RESULT" = "true" ]; then
    echo "[update-dns] OK: $NAME → $PUBLIC_IP"
  else
    echo "[update-dns] WARNING: cập nhật $NAME thất bại." >&2
  fi
done

echo "=== [update-dns] Done: $(date) ==="
