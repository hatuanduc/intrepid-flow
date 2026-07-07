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
  curl git openssl \
  nginx certbot python3-certbot-nginx \
  ca-certificates gnupg lsb-release

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

# ── 3. App directory ──────────────────────────────────────────────────────
mkdir -p /app
chown ubuntu:ubuntu /app

# ── 4. Nginx ──────────────────────────────────────────────────────────────
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx
systemctl start nginx

# ── Done ─────────────────────────────────────────────────────────────────
echo "=== [bootstrap] Done: $(date) ==="
touch /var/log/.bootstrapped
