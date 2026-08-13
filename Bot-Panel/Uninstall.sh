#!/usr/bin/env bash
#
# uninstall.sh — removes Bot Panel install artifacts
#
# Stops any running panel process, then optionally removes node_modules,
# logs, the pid file, and .env. Does NOT touch your bot's own files
# (BOT_CWD) or the panel's source code itself — this only cleans up
# what install.sh / botpanel.sh create.
#
set -uo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- resolve project root (this script lives in Bot-Panel/) ----
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="./panel.pid"
LOG_DIR="./logs"
APP_NAME="bot-panel"

echo "=========================================="
echo "         Bot Panel — Uninstaller"
echo "=========================================="
echo

# ---- stop the panel if it's running ----
stop_if_running() {
    if command -v pm2 &> /dev/null && pm2 describe "$APP_NAME" &> /dev/null 2>&1; then
        info "Stopping pm2-managed panel..."
        pm2 stop "$APP_NAME" &> /dev/null || true
        pm2 delete "$APP_NAME" &> /dev/null || true
        pm2 save &> /dev/null || true
        info "Removed panel from pm2."
        return
    fi

    if [ -f "$PID_FILE" ]; then
        local pid
        pid="$(cat "$PID_FILE")"
        if kill -0 "$pid" 2>/dev/null; then
            info "Stopping running panel (PID $pid)..."
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                warn "Panel did not stop gracefully — forcing kill."
                kill -9 "$pid" 2>/dev/null
            fi
            info "Panel stopped."
        fi
        rm -f "$PID_FILE"
    else
        info "Panel does not appear to be running."
    fi
}

stop_if_running
echo

# ---- confirm scope of removal ----
warn "This will remove installed dependencies and local runtime files:"
echo "    - node_modules/"
echo "    - ${LOG_DIR}/ (panel logs)"
echo "    - panel.pid"
echo
read -rp "Also delete .env (your PANEL_PASSWORD, SESSION_SECRET, and bot settings)? [y/N]: " DELETE_ENV
echo
read -rp "Proceed with uninstall? [y/N]: " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    warn "Uninstall cancelled."
    exit 0
fi

# ---- remove artifacts ----
if [ -d "node_modules" ]; then
    rm -rf node_modules
    info "Removed node_modules/"
else
    info "node_modules/ not found — nothing to remove."
fi

if [ -d "$LOG_DIR" ]; then
    rm -rf "$LOG_DIR"
    info "Removed ${LOG_DIR}/"
fi

rm -f "$PID_FILE"

if [[ "$DELETE_ENV" =~ ^[Yy]$ ]]; then
    if [ -f ".env" ]; then
        rm -f .env
        info "Removed .env"
    else
        info ".env not found — nothing to remove."
    fi
else
    info "Keeping .env (not deleted)."
fi

echo
info "Uninstall complete."
echo
echo "Notes:"
echo "  - The panel's source code (server.js, botController.js, public/, etc.) was left in place."
echo "  - Your bot's own working directory (BOT_CWD) and its files were not touched."
echo "  - To fully remove the project, delete this folder manually after this script finishes."
