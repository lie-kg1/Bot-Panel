#!/usr/bin/env bash
#
# Setup .env Configuration.sh — interactive .env editor for Bot Panel
#
# Lets you view and update PANEL_PASSWORD, SESSION_SECRET, PORT,
# BOT_COMMAND, BOT_ARGS, and BOT_CWD without hand-editing the file.
#
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- resolve project root (this script lives in Bot-Panel/) ----
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

echo "──────────────────────────────────────────"
echo "     Bot Panel — .env Configuration"
echo "──────────────────────────────────────────"
echo

# ---- ensure .env exists ----
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        info "No .env found — created one from $ENV_EXAMPLE."
    else
        error "Neither .env nor .env.example found. Cannot continue."
        exit 1
    fi
fi

# ---- helper: get current value of a key ----
get_val() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d '=' -f2-
}

# ---- helper: set/update a key, preserving the rest of the file ----
set_val() {
    local key="$1"
    local val="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
        echo "${key}=${val}" >> "$ENV_FILE"
    fi
}

# ---- prompt helper: shows current value, keeps it on blank input ----
prompt_val() {
    local key="$1"
    local label="$2"
    local secret="${3:-false}"
    local current
    current="$(get_val "$key")"

    if [ "$secret" = "true" ] && [ -n "$current" ]; then
        echo -e "${CYAN}${label}${NC} (current: [hidden], press Enter to keep)"
    else
        echo -e "${CYAN}${label}${NC} (current: ${current:-not set}, press Enter to keep)"
    fi
    read -rp "> " new_val

    if [ -n "$new_val" ]; then
        set_val "$key" "$new_val"
        info "${key} updated."
    fi
    echo
}

# ---- walk through each setting ----
prompt_val "PANEL_PASSWORD" "Panel login password" true

echo -e "${CYAN}Session secret${NC} (used to sign session cookies)"
read -rp "Auto-generate a new random secret? [y/N]: " GEN_SECRET
if [[ "$GEN_SECRET" =~ ^[Yy]$ ]]; then
    if command -v openssl &> /dev/null; then
        NEW_SECRET="$(openssl rand -hex 32)"
        set_val "SESSION_SECRET" "$NEW_SECRET"
        info "SESSION_SECRET regenerated."
    else
        warn "openssl not found — cannot auto-generate. Enter one manually below instead."
        prompt_val "SESSION_SECRET" "Session secret" true
    fi
else
    prompt_val "SESSION_SECRET" "Session secret" true
fi
echo

prompt_val "PORT" "Port for the panel to listen on"
prompt_val "BOT_COMMAND" "Command used to launch the bot (e.g. python3)"
prompt_val "BOT_ARGS" "Arguments passed to the bot command (e.g. bot.py)"
prompt_val "BOT_CWD" "Working directory the bot runs from (e.g. ./bot)"

# ---- create bot working directory if missing ----
BOT_CWD_VAL="$(get_val "BOT_CWD")"
BOT_CWD_VAL="${BOT_CWD_VAL:-./bot}"
if [ ! -d "$BOT_CWD_VAL" ]; then
    warn "Bot working directory '$BOT_CWD_VAL' does not exist."
    read -rp "Create it now? [y/N]: " CREATE_DIR
    if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
        mkdir -p "$BOT_CWD_VAL"
        info "Created $BOT_CWD_VAL"
    fi
fi

echo
info "Configuration saved to $ENV_FILE."
echo
echo "Current settings:"
echo "-----------------"
grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | while IFS='=' read -r key value; do
    if [ "$key" = "PANEL_PASSWORD" ] || [ "$key" = "SESSION_SECRET" ]; then
        echo "  ${key}=********"
    else
        echo "  ${key}=${value}"
    fi
done
echo
warn "Restart the panel (npm start) for changes to take effect."
