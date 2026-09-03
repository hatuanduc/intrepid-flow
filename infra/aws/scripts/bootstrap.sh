#!/bin/bash
# Runs automatically via EC2 User Data on first boot (as root)
# Installs Docker Engine + Nginx only — app runtime is inside containers
# Output: /var/log/bootstrap.log
set -euo pipefail
exec > >(tee /var/log/bootstrap.log) 2>&1

echo "=== [bootstrap] Start: $(date) ==="

# ── 1. System packages ────────────────────────────────────────────────────
apt-get update -y
apt-get install -y \
  curl git openssl unzip jq \
  nginx certbot python3-certbot-nginx \
  ca-certificates gnupg lsb-release

# ── 1b. AWS CLI v2 (ARM64) — deploy.sh needs it to pull S3 code + SSM params ──
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi

# ── 2. Docker Engine (official apt repo, ARM64-compatible) ────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow ubuntu user to run docker without sudo
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker

# ── 3. Swap (safety net for occasional memory-heavy jobs, e.g. reconcile) ──
# t4g.medium only has 4GB RAM; reconcile's per-file child process can peak
# at 2-3GB for large invoice files. Swap absorbs that rare spike instead of
# the OOM killer taking down other containers (web/api/worker/db).
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
  # Prefer RAM over swap — only fall back to swap under real memory pressure,
  # not proactively, since swap on EBS is far slower than RAM.
  sysctl -w vm.swappiness=10
  echo "vm.swappiness=10" >> /etc/sysctl.conf
fi

# ── 4. App directory ───────────────────────────────────────────────────────
mkdir -p /app
chown ubuntu:ubuntu /app

# ── 5. Nginx ──────────────────────────────────────────────────────────────
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx
systemctl start nginx

# ── 6. Cloudflare DNS auto-update ──────────────────────────────────────────
# EC2 không có Elastic IP → public IP đổi mỗi lần start. Service này chạy
# update-dns.sh (từ repo, /app/infra/...) mỗi lần boot để PATCH lại A record.
# Chỉ cần cài + enable 1 lần ở đây — systemd tự chạy lại ở mọi lần boot sau,
# kể cả khi EventBridge Scheduler start instance (không liên quan user_data).
#
# Lần boot đầu tiên (instance vừa được Terraform tạo/replace) /app chưa có
# code — CI/CD deploy job chỉ upload code sau khi `terraform apply` xong, có
# thể mất vài phút. Trước đây service fail 1 lần rồi thôi (không tự retry),
# nên nếu deploy job chậm hơn dự kiến hoặc không có lần start/reboot nào tiếp
# theo để systemd chạy lại — DNS record kẹt ở IP cũ vô thời hạn (đã xảy ra
# thật trên dev 2026-09-03: instance bị replace do AMI drift, service fail
# ngay lúc boot vì /app rỗng, và không ai/gì kích hoạt lại nó cho tới khi phát
# hiện + chạy tay `systemctl restart`). Restart=on-failure + RestartSec để
# service tự thử lại mỗi 10s trong tối đa 10 phút — đủ thời gian cho deploy
# job hoàn tất population /app.
cat > /etc/systemd/system/intrepid-dns-update.service <<'UNIT'
[Unit]
Description=Update Cloudflare DNS A record with this instance's current public IP
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=600
StartLimitBurst=60

[Service]
Type=oneshot
ExecStart=/bin/bash /app/infra/aws/scripts/update-dns.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable intrepid-dns-update.service

# ── Done ─────────────────────────────────────────────────────────────────
echo "=== [bootstrap] Done: $(date) ==="
touch /var/log/.bootstrapped
