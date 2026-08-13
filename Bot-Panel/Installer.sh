#!/usr/bin/env bash
#
# install.sh — installer for Bot Panel
# Installs dependencies, sets up .env, and prepares the panel to run.
#
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [[ "${BASH_SOURCE[0]}" == /dev/fd/* || "${BASH_SOURCE[0]}" == /proc/*/fd/* ]]; then
    PROJECT_ROOT="$PWD"
else
    PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
fi
cd "$PROJECT_ROOT"

echo "=========================================="
echo "          Bot Panel — Installer"
echo "=========================================="
echo

if [ ! -f "package.json" ]; then
    error "package.json not found in $(pwd)."
    error "Run this from inside the Bot-Panel project directory."
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

info "Installing dependencies..."
npm install

if [ -f ".env" ]; then
    warn ".env already exists — leaving it untouched."
else
    if [ -f ".env.example" ]; then
        cp .env.example .env
        info "Created .env from .env.example."
    else
        error ".env.example not found."
        exit 1
    fi

    if command -v openssl &> /dev/null; then
        SESSION_SECRET="$(openssl rand -hex 32)"
        if grep -q '^SESSION_SECRET=' .env; then
            sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env && rm -f .env.bak
            info "Generated a random SESSION_SECRET."
        fi
    fi
fi

echo
info "Installation complete."
