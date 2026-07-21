#!/bin/bash
# One-time nginx setup trên EC2 — pull Cloudflare Origin CA cert từ SSM rồi cấu hình nginx.
#
# Usage:  sudo bash /app/infra/aws/scripts/setup-nginx.sh dev|prod
#
# Yêu cầu trước khi chạy (1 lần, từ máy local có AWS credentials):
#   1. Tạo Origin CA cert trên Cloudflare dashboard:
#      SSL/TLS → Origin Server → Create Certificate
#      → hostnames: naronx.asia, *.naronx.asia — validity 15 years
#   2. Đẩy cert + key lên SSM (path shared — dùng chung dev + prod):
#      aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_CERT" \
#        --value file://origin.pem --type SecureString --overwrite --region ap-southeast-1
#      aws ssm put-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_KEY" \
#        --value file://origin.key --type SecureString --overwrite --region ap-southeast-1
set -euo pipefail

APP_ENV="${1:-}"
case "$APP_ENV" in
  dev)
    WEB_DOMAIN="dev-intrepid.naronx.asia"
    API_DOMAIN="api-dev-intrepid.naronx.asia"
    ;;
  prod)
    WEB_DOMAIN="intrepid.naronx.asia"
    API_DOMAIN="api-intrepid.naronx.asia"
    ;;
  *)
    echo "Usage: sudo $0 dev|prod" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"
SSL_DIR="/etc/ssl/cloudflare"

echo "[setup-nginx] env=$APP_ENV web=$WEB_DOMAIN api=$API_DOMAIN"

# ── Pull Origin CA cert từ SSM ──────────────────────────────────────────────
echo "[setup-nginx] Pulling Cloudflare Origin CA cert from SSM /intrepid/shared/..."
mkdir -p "$SSL_DIR"

aws ssm get-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_CERT" \
  --with-decryption --region "$REGION" \
  --query "Parameter.Value" --output text > "$SSL_DIR/origin.pem"

aws ssm get-parameter --name "/intrepid/shared/CLOUDFLARE_ORIGIN_KEY" \
  --with-decryption --region "$REGION" \
  --query "Parameter.Value" --output text > "$SSL_DIR/origin.key"

chmod 644 "$SSL_DIR/origin.pem"
chmod 600 "$SSL_DIR/origin.key"

if ! grep -q "BEGIN CERTIFICATE" "$SSL_DIR/origin.pem"; then
  echo "ERROR: /intrepid/shared/CLOUDFLARE_ORIGIN_CERT chưa được set (vẫn là PLACEHOLDER?)" >&2
  echo "       Xem hướng dẫn put-parameter ở comment đầu file này." >&2
  exit 1
fi
if ! grep -q "PRIVATE KEY" "$SSL_DIR/origin.key"; then
  echo "ERROR: /intrepid/shared/CLOUDFLARE_ORIGIN_KEY chưa được set (vẫn là PLACEHOLDER?)" >&2
  exit 1
fi

# ── Render config + reload ─────────────────────────────────────────────────
sed -e "s/__WEB_DOMAIN__/$WEB_DOMAIN/g" \
    -e "s/__API_DOMAIN__/$API_DOMAIN/g" \
    "$SCRIPT_DIR/nginx.conf" > /etc/nginx/sites-available/intrepid

ln -sf /etc/nginx/sites-available/intrepid /etc/nginx/sites-enabled/intrepid
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "[setup-nginx] Done — nginx đang proxy:"
echo "  https://$WEB_DOMAIN  → :3000 (web)"
echo "  https://$API_DOMAIN  → :4000 (api)"
