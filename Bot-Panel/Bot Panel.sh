#!/bin/bash
set -e

# ANSI Color Codes
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

launch_botpanel() {
    if [ -x "${SCRIPT_DIR}/botpanel.sh" ]; then
        "${SCRIPT_DIR}/botpanel.sh" start
    elif [ -f "${SCRIPT_DIR}/botpanel.sh" ]; then
        bash "${SCRIPT_DIR}/botpanel.sh" start
    else
        printf "${RED}botpanel.sh not found in ${SCRIPT_DIR}.${NC}\n"
    fi
}

while true; do
    clear
    printf "${BLUE}──────────────────────────────────────${NC}\n"
    printf "${CYAN}              Bot Panel               ${NC}\n"
    printf "${BLUE}──────────────────────────────────────${NC}\n"
    printf "${YELLOW}1)${NC} 📦 Installer\n"
    printf "${YELLOW}2)${NC} ⚙️ .env Configuration File\n"
    printf "${YELLOW}3)${NC} 🚀 24/7 Manager\n"
    printf "${YELLOW}4)${NC} 🗑️ Running Uninstall\n"
    printf "${YELLOW}5)${NC} 🌐 Launch Bot Panel\n"
    printf "${YELLOW}6)${NC} 👋 Exit\n"
    printf "${BLUE}──────────────────────────────────────${NC}\n"
    read -p "Choose an option [1-6]: " choice
    case $choice in
        1)
            printf "${GREEN}Running install...${NC}\n"
            bash <(curl -sL https://raw.githubusercontent.com/lie-kg1/Bot-Panel/refs/heads/main/Bot-Panel/Installer.sh)
            read -p "Press Enter to continue..."
            ;;
        2)
            printf "${GREEN}Creating bot configuration...${NC}\n"
            bash <(curl -sL "https://raw.githubusercontent.com/lie-kg1/Bot-Panel/refs/heads/main/Bot-Panel/.env%20Configuration.sh")
            read -p "Press Enter to continue..."
            ;;
        3)
            printf "${GREEN}Opening 24/7 manager...${NC}\n"
            bash <(curl -sL "https://raw.githubusercontent.com/lie-kg1/Bot-Panel/refs/heads/main/Bot-Panel/247%20Manager.sh")
            read -p "Press Enter to continue..."
            ;;
        4)
            printf "${RED}Running uninstall...${NC}\n"
            bash <(curl -sL https://raw.githubusercontent.com/lie-kg1/Bot-Panel/refs/heads/main/Bot-Panel/Uninstall.sh)
            read -p "Press Enter to continue..."
            ;;
        5)
            launch_botpanel
            read -p "Press Enter to continue..."
            ;;
        6)
            printf "${CYAN}Exiting...${NC}\n"
            exit 0
            ;;
        *)
            printf "${RED}⚠️ Invalid option. Please choose a valid option.${NC}\n"
            sleep 2
            ;;
    esac
done
