#!/usr/bin/env bash
# wa-connect-pro — one-shot VPS bootstrap script
#
# Designed for fresh Ubuntu 22.04 / 24.04 (Hostinger KVM, DigitalOcean
# Droplet, Vultr, etc.) running as root.
#
# Run on a fresh box:
#   curl -fsSL https://raw.githubusercontent.com/adeelahmadBillPro/wa-connect-pro/master/setup-vps.sh | bash
#
# After it finishes, paste your .env.local content into /root/wa-connect-pro-new/.env.local
# then run:  pm2 start /root/wa-connect-pro-new/ecosystem.config.js && pm2 save && pm2 startup

set -euo pipefail

REPO_URL="https://github.com/adeelahmadBillPro/wa-connect-pro.git"
APP_DIR="/root/wa-connect-pro-new"
NODE_MAJOR=20

log() { echo -e "\033[1;32m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
fail() { echo -e "\033[1;31m[fail]\033[0m $*" >&2; exit 1; }

# ── Pre-flight ──────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || fail "Run as root (use sudo or root login)."
command -v apt >/dev/null || fail "This script requires apt (Ubuntu/Debian)."

log "Updating package index..."
apt-get update -qq

# ── Node.js + tools ─────────────────────────────────────────────────────────
if ! command -v node >/dev/null || [[ "$(node --version 2>/dev/null | cut -dv -f2 | cut -d. -f1)" -lt $NODE_MAJOR ]]; then
  log "Installing Node.js ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node.js already installed ($(node --version))"
fi

log "Installing git, build tools, pm2..."
apt-get install -y git build-essential
npm install -g pm2

# ── Clone / pull repo ───────────────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo already present — pulling latest"
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ── Ecosystem config (with the IPv4 fix Hostinger requires) ─────────────────
log "Writing ecosystem.config.js (port 80, IPv4-first DNS)"
cat > "$APP_DIR/ecosystem.config.js" <<'EOF'
module.exports = {
  apps: [{
    name: "wa-connect-pro",
    script: "npm",
    args: "start -- -p 80",
    cwd: "/root/wa-connect-pro-new",
    env: {
      // Hostinger VPS IPv6 is broken; Node fetch defaults to IPv6 first
      // and pre-key writes to Supabase silently fail. This forces IPv4.
      NODE_OPTIONS: "--dns-result-order=ipv4first"
    }
  }]
}
EOF

# ── Install + build ─────────────────────────────────────────────────────────
log "npm install..."
npm install --omit=dev=false

log "npm run build..."
npm run build

# ── .env.local hint ─────────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env.local" ]]; then
  warn "No .env.local found. Create it before starting PM2:"
  echo
  echo "    nano $APP_DIR/.env.local"
  echo
  echo "Required keys at minimum:"
  echo "    NEXT_PUBLIC_SUPABASE_URL"
  echo "    NEXT_PUBLIC_SUPABASE_ANON_KEY"
  echo "    SUPABASE_SERVICE_ROLE_KEY"
  echo "    PLATFORM_ADMIN_IDS"
  echo "    ADMIN_WHATSAPP_NUMBER"
  echo
fi

# ── Daily counter reset cron (Phase 2) ──────────────────────────────────────
CRON_LINE='0 0 * * * curl -fsS http://localhost/api/cron/update-warmup?secret=process >> /var/log/wa-cron.log 2>&1'
if ! crontab -l 2>/dev/null | grep -qF "/api/cron/update-warmup"; then
  log "Installing daily reset cron (00:00 UTC)"
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
fi

# ── Done ────────────────────────────────────────────────────────────────────
log "Bootstrap complete."
echo
echo "Next steps:"
echo "  1. Paste your .env.local content:   nano $APP_DIR/.env.local"
echo "  2. Start the app:                   pm2 start $APP_DIR/ecosystem.config.js"
echo "  3. Persist across reboots:          pm2 save && pm2 startup"
echo "  4. Verify health:                   curl http://localhost/api/health"
echo
