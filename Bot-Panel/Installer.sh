#!/usr/init/env bash
#
# install.sh — Automated Installer for Bot Panel
#

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Resolve project root safely
if [[ "${BASH_SOURCE[0]}" == /dev/fd/* || "${BASH_SOURCE[0]}" == /proc/*/fd/* ]]; then
    PROJECT_ROOT="$PWD"
else
    PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
fi

cd "$PROJECT_ROOT"

# Auto-navigate into Bot-Panel folder if executed from parent workspace
if [ ! -f "package.json" ] && [ -d "Bot-Panel" ] && [ -f "Bot-Panel/package.json" ]; then
    info "Found Bot-Panel directory. Moving inside..."
    cd "Bot-Panel"
    PROJECT_ROOT="$PWD"
fi

echo "=========================================="
echo "          Bot Panel — Installer"
echo "=========================================="
echo

# 1. Verify Node.js project environment
if [ ! -f "package.json" ]; then
    error "package.json not found in $(pwd)."
    error "Please run this script from inside the Bot-Panel project directory."
    exit 1
fi

if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Install Node.js (v18+ recommended) and re-run."
    exit 1
fi
info "Found Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
    error "npm is not installed."
    exit 1
fi

# 2. Install Node Dependencies
info "Installing Node.js dependencies..."
npm install

# 3. Setup Node.js .env configuration
if [ -f ".env" ]; then
    warn ".env already exists — leaving it untouched."
else
    if [ -f ".env.example" ]; then
        cp .env.example .env
        info "Created .env from .env.example."
    else
        warn ".env.example not found. Creating a blank .env file."
        touch .env
    fi

    if command -v openssl &> /dev/null; then
        SESSION_SECRET="$(openssl rand -hex 32)"
        if grep -q '^SESSION_SECRET=' .env; then
            sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env && rm -f .env.bak
        else
            echo "SESSION_SECRET=${SESSION_SECRET}" >> .env
        fi
        info "Generated and added a secure SESSION_SECRET."
    fi
fi

echo
info "Installation complete!"
echo "To start your panel, run: npm start"
