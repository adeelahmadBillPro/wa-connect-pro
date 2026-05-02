#!/usr/bin/env bash
# wa-connect-pro — VPS bootstrap script (two-pass safe)
#
# Designed for fresh Ubuntu 22.04 / 24.04 VPS running as root.
#
# Pass 1 (no .env.local yet):
#   curl -fsSL https://raw.githubusercontent.com/adeelahmadBillPro/wa-connect-pro/master/setup-vps.sh | bash
#   → installs Node, PM2, clones repo, writes ecosystem.config.js (with the
#     NODE_OPTIONS=--dns-result-order=ipv4first that Hostinger requires),
#     runs npm install, then STOPS and prints instructions to paste .env.local.
#
# Pass 2 (after pasting .env.local):
#   Same curl command — script detects .env.local and proceeds to build + start.
#
# WHY TWO PASSES: NEXT_PUBLIC_* env vars are baked into the JS bundle at
# build time. Building before .env.local exists ships the bundle with
# placeholder Supabase URLs, which makes browser login fail with
# "Failed to fetch / ERR_NAME_NOT_RESOLVED". Lesson learned the hard way.

set -euo pipefail

REPO_URL="https://github.com/adeelahmadBillPro/wa-connect-pro.git"
APP_DIR="/root/wa-connect-pro-new"
NODE_MAJOR=20

log()  { echo -e "\033[1;32m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m  $*"; }
fail() { echo -e "\033[1;31m[fail]\033[0m  $*" >&2; exit 1; }

# ── Pre-flight ──────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || fail "Run as root."
command -v apt >/dev/null || fail "This script requires apt (Ubuntu/Debian)."

log "Updating package index..."
apt-get update -qq

# ── Node.js ─────────────────────────────────────────────────────────────────
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

# ── Repo ────────────────────────────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo present — pulling latest"
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ── Ecosystem config (always rewrite — IPv4 fix is critical) ────────────────
log "Writing ecosystem.config.js with required NODE_OPTIONS..."
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
      // DO NOT REMOVE — losing this causes WhatsApp 401 logouts in ~24h.
      NODE_OPTIONS: "--dns-result-order=ipv4first"
    }
  }]
}
EOF

log "npm install..."
npm install --omit=dev=false

# ── GATE: refuse to build until .env.local exists ──────────────────────────
# (This is the bug fix from the first deploy — building without .env.local
# bakes placeholder Supabase URLs into the browser bundle.)
if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo
  warn "═══════════════════════════════════════════════════════════════════"
  warn ".env.local NOT FOUND — script paused here on purpose."
  warn ""
  warn "  Why: NEXT_PUBLIC_* env vars are compiled into the browser bundle"
  warn "  at build time. Building without them breaks the login screen."
  warn ""
  warn "  Next steps:"
  warn ""
  warn "    1. Paste your .env.local content:"
  warn "         nano $APP_DIR/.env.local"
  warn ""
  warn "    2. Re-run THIS script (it will detect .env.local and continue):"
  warn "         curl -fsSL https://raw.githubusercontent.com/adeelahmadBillPro/wa-connect-pro/master/setup-vps.sh | bash"
  warn ""
  warn "  Required keys at minimum:"
  warn "         NEXT_PUBLIC_SUPABASE_URL"
  warn "         NEXT_PUBLIC_SUPABASE_ANON_KEY"
  warn "         SUPABASE_SERVICE_ROLE_KEY"
  warn "         PLATFORM_ADMIN_IDS"
  warn "         ADMIN_WHATSAPP_NUMBER"
  warn "         NEXT_PUBLIC_APP_URL    (e.g. http://YOUR_VPS_IP)"
  warn "═══════════════════════════════════════════════════════════════════"
  echo
  exit 0
fi

# ── Build (with .env.local present so NEXT_PUBLIC_* are baked correctly) ────
log ".env.local found — building with embedded NEXT_PUBLIC_* values..."
npm run build

# ── Start under PM2 ────────────────────────────────────────────────────────
log "Starting / restarting under PM2..."
if pm2 list 2>/dev/null | grep -q wa-connect-pro; then
  log "  wa-connect-pro already in PM2 — deleting for a clean restart"
  pm2 delete wa-connect-pro || true
fi
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save
# pm2 startup output ends with a command we should run; grab + execute it
log "Configuring PM2 to survive reboot..."
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ── Daily counter reset cron (Phase 2) ─────────────────────────────────────
CRON_LINE='0 0 * * * curl -fsS http://localhost/api/cron/update-warmup?secret=process >> /var/log/wa-cron.log 2>&1'
if ! crontab -l 2>/dev/null | grep -qF "/api/cron/update-warmup"; then
  log "Installing daily reset cron (00:00 UTC)"
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
fi

# ── Verification (the part that would have caught yesterday's bug) ─────────
sleep 5

log "Verifying NODE_OPTIONS is active on the running process..."
if pm2 env 0 2>/dev/null | grep -q "NODE_OPTIONS.*ipv4first"; then
  log "  ✓ NODE_OPTIONS=--dns-result-order=ipv4first ACTIVE"
else
  warn "  ✗ NODE_OPTIONS NOT detected — fetch writes WILL FAIL on Hostinger"
  warn "    Run: pm2 delete wa-connect-pro && pm2 start $APP_DIR/ecosystem.config.js"
fi

log "Verifying /api/health responds..."
sleep 5
if curl -fsS http://localhost/api/health > /dev/null 2>&1; then
  log "  ✓ App responding on port 80"
else
  warn "  ✗ /api/health timed out — run: pm2 logs wa-connect-pro --lines 30"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo
log "═══════════════════════════════════════════════════════════════════"
log "Setup complete."
log ""
log "  Open in browser:    http://YOUR_VPS_IP"
log "  Login as admin, then add WhatsApp Sessions and scan QR(s)."
log ""
log "  Health check:       curl http://localhost/api/health"
log "  Tail logs:          pm2 logs wa-connect-pro"
log "  Auth health (60s):  pm2 flush wa-connect-pro && sleep 60 \\"
log "                        && pm2 logs wa-connect-pro --err --lines 30 \\"
log "                        --nostream | grep -c 'writeKey failed'"
log "                        (should print 0)"
log "═══════════════════════════════════════════════════════════════════"
