#!/usr/bin/env bash
#
# deploy-all.sh — Combined Installer for Bot Panel & VPS Deployment
#

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/lie-kg1/Bot-Panel/refs/heads/main/installer.sh"

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

echo "=========================================="
echo "      Bot Panel — Full Installer"
echo "=========================================="
echo

# 1. Verify Node.js project environment
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

# 4. Optional VPS Python environment setup
if [ -d "Bot-Panel" ] || [ -f "bot.py" ] || [ -f "requirements.txt" ]; then
    info "Setting up VPS environment files..."
    mkdir -p Bot-Panel
    
    if [ -f "requirements.txt" ]; then
        cp requirements.txt Bot-Panel/
    fi
    if [ -f "bot.py" ]; then
        cp bot.py Bot-Panel/
    fi

    if command -v apt &> /dev/null && command -v sudo &> /dev/null; then
        info "Installing system Python packages via apt..."
        sudo apt update -y && sudo apt install -y python3-pip
        
        cd vps-deploy
        if [ -f "requirements.txt" ]; then
            python3 -m pip install -r requirements.txt --quiet
        fi
        python3 -m pip install --upgrade --quiet discord.py docker python-dotenv aiofiles PyNaCl psutil
        cd "$PROJECT_ROOT"
    fi
fi

echo
info "Full installation complete!"
echo "To start your panel, run: npm start"
