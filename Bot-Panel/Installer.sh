#!/usr/bin/env bash
#
# install.sh — installer for Bot Panel
# Installs dependencies, sets up .env, and prepares the panel to run.
#
# Works both as a local file (./install.sh) and when piped/run via
# process substitution (bash <(curl -sL .../install.sh)) — in the
# latter case there's no real script path on disk, so we fall back
# to the current working directory instead of guessing one.
#
set -euo pipefail

# ---- colors ----
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- resolve project root ----
# When run via `bash <(curl ...)`, BASH_SOURCE[0] is a fake path like
# /proc/12345/fd/63 or /dev/fd/63 — not a real script location. Detect
# that and use the current directory instead of cd-ing into procfs.
if [[ "${BASH_SOURCE[0]}" == /dev/fd/* || "${BASH_SOURCE[0]}" == /proc/*/fd/* ]]; then
    PROJECT_ROOT="$PWD"
else
    PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
fi
cd "$PROJECT_ROOT"

echo "=========================================="
echo "         Bot Panel — Installer"
echo "=========================================="
echo

# ---- confirm we're actually in the project directory ----
if [ ! -f "package.json" ]; then
    error "package.json not found in $(pwd)."
    error "Run this from inside the Bot-Panel project directory (where package.json lives)."
    error "If you haven't cloned the repo yet: git clone https://github.com/lie-kg1/Bot-Panel.git && cd Bot-Panel"
    exit 1
fi

# ---- check for Node.js ----
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Install Node.js (v18+ recommended) and re-run this script."
    exit 1
fi
NODE_VERSION="$(node -v)"
info "Found Node.js $NODE_VERSION"

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js $NODE_VERSION is older than the recommended v18+. The panel may still work, but consider upgrading if you hit issues."
fi

# ---- check for npm ----
if ! command -v npm &> /dev/null; then
    error "npm is not installed. It usually ships with Node.js — please install it and re-run this script."
    exit 1
fi
info "Found npm $(npm -v)"

# ---- install dependencies ----
info "Installing dependencies (npm install)..."
npm install

# ---- set up .env ----
if [ -f ".env" ]; then
    warn ".env already exists — leaving it untouched."
else
    if [ -f ".env.example" ]; then
        cp .env.example .env
        info "Created .env from .env.example."
    else
        error ".env.example not found — cannot create .env automatically."
        exit 1
    fi

    # Generate a random session secret if possible
    if command -v openssl &> /dev/null; then
        SESSION_SECRET="$(openssl rand -hex 32)"
        if grep -q '^SESSION_SECRET=' .env; then
            sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env && rm -f .env.bak
            info "Generated a random SESSION_SECRET."
        fi
    else
        warn "openssl not found — please set SESSION_SECRET manually in .env."
    fi

    # Prompt for a panel password
    echo
    read -rp "Set a PANEL_PASSWORD now? (leave blank to edit .env manually later): " PANEL_PASSWORD
    if [ -n "${PANEL_PASSWORD:-}" ] && grep -q '^PANEL_PASSWORD=' .env; then
        sed -i.bak "s|^PANEL_PASSWORD=.*|PANEL_PASSWORD=${PANEL_PASSWORD}|" .env && rm -f .env.bak
        info "PANEL_PASSWORD set."
    else
        warn "Remember to set PANEL_PASSWORD in .env before running the panel."
    fi
fi

# ---- ensure bot working directory exists ----
BOT_CWD="$(grep -E '^BOT_CWD=' .env 2>/dev/null | cut -d '=' -f2- || echo './bot')"
BOT_CWD="${BOT_CWD:-./bot}"
if [ ! -d "$BOT_CWD" ]; then
    warn "Bot working directory '$BOT_CWD' does not exist yet."
    read -rp "Create it now? [y/N]: " CREATE_DIR
    if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
        mkdir -p "$BOT_CWD"
        info "Created $BOT_CWD"
    fi
fi

echo
info "Installation complete."
echo
echo "Next steps:"
echo "  1. Review/edit .env (PANEL_PASSWORD, BOT_COMMAND, BOT_ARGS, BOT_CWD, PORT)"
echo "  2. Start the panel with: npm start   (or ./botpanel.sh if provided)"
echo "  3. Open http://localhost:<PORT> and sign in with your PANEL_PASSWORD"
echo
warn "Security reminder: don't expose this panel to the internet without a reverse proxy + HTTPS."
