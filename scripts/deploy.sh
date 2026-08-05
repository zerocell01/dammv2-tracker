#!/usr/bin/env bash
# One-shot deploy script for dammv2-tracker on a fresh Ubuntu/Debian VPS.
# Usage: run this ON THE VPS (as root or with sudo).
#   curl -fsSL https://raw.githubusercontent.com/zerocell01/dammv2-tracker/claude/dammv2-solana-tracker-g71ik5/scripts/deploy.sh | bash
# or clone the repo and run ./scripts/deploy.sh
set -euo pipefail

REPO_URL="https://github.com/zerocell01/dammv2-tracker.git"
BRANCH="claude/dammv2-solana-tracker-g71ik5"
APP_DIR="/opt/dammv2-tracker"
PM2_NAME="dammv2-alert"

echo "==> Installing base packages"
apt-get update -y
apt-get install -y curl git build-essential

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "==> Node.js already installed: $(node -v)"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing pm2"
  npm install -g pm2
else
  echo "==> pm2 already installed"
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Repo exists, pulling latest"
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "==> Cloning repo into $APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!!! .env belum diisi. Edit dulu sebelum bot bisa jalan:"
  echo "    nano $APP_DIR/.env"
  echo "    Isi minimal: TELEGRAM_BOT_TOKEN dan HELIUS_API_KEY"
  echo ""
fi

echo "==> Installing dependencies + building"
npm install
npm run build

mkdir -p "$APP_DIR/data"

echo "==> Starting with pm2 as '$PM2_NAME'"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start dist/index.js --name "$PM2_NAME" --cwd "$APP_DIR"
pm2 save

echo "==> Enabling pm2 on boot"
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true
pm2 save

echo ""
echo "==> Done. Cek status: pm2 status"
echo "==> Cek log:          pm2 logs $PM2_NAME"
echo "==> Kalau belum isi .env, edit lalu restart: pm2 restart $PM2_NAME"
