#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/marceltielman/virtuagym-bot.git"
APP_DIR="$HOME/virtuagym"

echo "=== Virtuagym EC2 setup (Ubuntu 24.04) ==="

# ── 1. System update ────────────────────────────────────────────────
echo ">>> apt update & upgrade"
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Node.js 20 via NodeSource ────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ">>> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node $(node -v)  npm $(npm -v)"

# ── 3. Clone or pull repo ──────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo ">>> git pull"
  git -C "$APP_DIR" pull
else
  echo ">>> Cloning repo"
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 4. Install deps + Playwright Chromium ───────────────────────────
echo ">>> npm ci"
npm ci

echo ">>> Installing Playwright Chromium + OS deps"
npx playwright install --with-deps chromium

# ── 5. Create .env ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo ">>> Creating .env — enter values (leave blank to skip optional vars)"

  read -rp "VG_LOGIN_URL: " VG_LOGIN_URL
  read -rp "VG_WEEK_QUERY (optional): " VG_WEEK_QUERY
  read -rp "VG_CLASS_NAME: " VG_CLASS_NAME
  read -rp "VG_CLASS_TIME: " VG_CLASS_TIME

  cat > .env <<EOF
VG_LOGIN_URL=$VG_LOGIN_URL
VG_WEEK_QUERY=$VG_WEEK_QUERY
VG_CLASS_NAME=$VG_CLASS_NAME
VG_CLASS_TIME=$VG_CLASS_TIME
EOF

  echo ".env created"
else
  echo ">>> .env already exists, skipping"
fi

# ── 6. Install crontab ─────────────────────────────────────────────
CRON_MARKER="# virtuagym-bot"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  echo ">>> Cron already installed, skipping"
else
  echo ">>> Installing crontab entries"

  # Wintertijd (CET): 20:00 AMS = 19:00 UTC  →  start cron at 18:55 UTC
  CRON_LINES=$(cat <<CRON
$CRON_MARKER
55-59 18 * * 1 cd $APP_DIR && /usr/bin/node book-virtuagym-ec2.js >> $APP_DIR/cron.log 2>&1
0-5 19 * * 1 cd $APP_DIR && /usr/bin/node book-virtuagym-ec2.js >> $APP_DIR/cron.log 2>&1
CRON
)

  ( crontab -l 2>/dev/null; echo "$CRON_LINES" ) | crontab -
  echo "Cron installed. Verify with: crontab -l"
fi

echo ""
echo "=== Done! ==="
echo "Test with:  cd $APP_DIR && npm run book:test"
echo "Logs at:    $APP_DIR/cron.log"
