#!/usr/bin/env bash
#
# deploy-all.sh — Combined Installer for Bot Panel & VPS Deployment
#

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Resolve project root safely and ensure we are in the Bot-Panel directory
if [[ "${BASH_SOURCE[0]}" == /dev/fd/* || "${BASH_SOURCE[0]}" == /proc/*/fd/* ]]; then
    PROJECT_ROOT="$PWD"
else
    PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
fi

cd "$PROJECT_ROOT"

# Auto-navigate into Bot-Panel folder if we are in the parent directory
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
    error "Please clone the repository or place this script inside the Bot-Panel project directory."
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

# 4. Optional VPS Python environment setup
if [ -f "bot.py" ] || [ -f "requirements.txt" ] || [ -d "vps-deploy" ]; then
    info "Setting up VPS environment files..."
    
    if command -v apt &> /dev/null && command -v sudo &> /dev/null; then
        info "Installing system Python packages via apt..."
        sudo apt update -y && sudo apt install -y python3-pip python3-venv
        
        if [ -d "vps-deploy" ]; then
            cd vps-deploy
            if [ -f "requirements.txt" ]; then
                python3 -m pip install -r requirements.txt --quiet
            fi
            cd "$PROJECT_ROOT"
        fi
        
        python3 -m pip install --upgrade --quiet discord.py docker python-dotenv aiofiles PyNaCl psutil
    fi
fi

echo
info "Full installation complete!"
echo "To start your panel, run: npm start"
