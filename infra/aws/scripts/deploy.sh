#!/bin/bash
# Called by GitHub Actions via SSM Run Command
# Required env: APP_ENV (dev|prod), AWS_DEFAULT_REGION
set -euo pipefail

APP_DIR="/app"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"

echo "[deploy] Start: $(date) — env=${APP_ENV}"

# Wait for bootstrap to finish (only relevant on brand-new instances)
if [ ! -f /var/log/.bootstrapped ]; then
  echo "[deploy] New instance — waiting for bootstrap (Docker install)..."
  timeout 600 bash -c 'until [ -f /var/log/.bootstrapped ]; do sleep 15; done' \
    || { echo "[deploy] ERROR: bootstrap timed out"; exit 1; }
  echo "[deploy] Bootstrap done."
fi

# Pull secrets + config từ SSM → /app/.env
echo "[deploy] Pulling parameters from SSM /intrepid/${APP_ENV}/..."
aws ssm get-parameters-by-path \
  --path "/intrepid/${APP_ENV}" \
  --with-decryption \
  --region "$REGION" \
  --query "Parameters[*].[Name,Value]" \
  --output text | while IFS=$'\t' read -r name value; do
    echo "$(basename "$name")=$value"
  done > "$APP_DIR/.env"

# Static values không thay đổi theo env
cat >> "$APP_DIR/.env" <<EOF
APP_ENV=${APP_ENV}
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
PLAYWRIGHT_HEADLESS=true
EOF

echo "[deploy] .env generated ($(wc -l < "$APP_DIR/.env") vars)"

cd "$APP_DIR"

echo "[deploy] Building images and starting services..."
$COMPOSE up --build -d --wait --wait-timeout 300

echo "[deploy] Done: $(date)"
$COMPOSE ps
