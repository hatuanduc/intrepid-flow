#!/bin/bash
# Called by GitHub Actions via SSH after rsync
set -euo pipefail

APP_DIR="/app"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"

echo "[deploy] Start: $(date)"

# Wait for bootstrap to finish (only relevant on brand-new instances)
if [ ! -f /tmp/.bootstrapped ]; then
  echo "[deploy] New instance — waiting for bootstrap (Docker install)..."
  timeout 600 bash -c 'until [ -f /tmp/.bootstrapped ]; do sleep 15; done' \
    || { echo "[deploy] ERROR: bootstrap timed out"; exit 1; }
  echo "[deploy] Bootstrap done."
fi

cd "$APP_DIR"

# Verify .env exists (created manually on first setup)
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[deploy] ERROR: /app/.env not found. Create it from .env.example and re-deploy."
  exit 1
fi

echo "[deploy] Building images and starting services..."
$COMPOSE up --build -d

echo "[deploy] Waiting for services to be healthy..."
sleep 5

echo "[deploy] Done: $(date)"
$COMPOSE ps
