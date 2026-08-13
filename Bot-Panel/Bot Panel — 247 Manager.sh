#!/usr/bin/env bash
#
# Opening 247 manager.sh — keeps Bot Panel running 24/7
#
# Runs the panel (npm start / server.js) under a restart-on-crash loop,
# logs output, and optionally hands off to pm2 if it's installed for
# proper daemonization + reboot survival.
#
set -uo pipefail

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

LOG_DIR="./logs"
LOG_FILE="${LOG_DIR}/panel.log"
PID_FILE="./panel.pid"
APP_NAME="bot-panel"
MAX_RESTARTS=20
RESTART_WINDOW=60   # seconds — restarts are counted within this rolling window

mkdir -p "$LOG_DIR"

echo "=========================================="
echo "     Bot Panel — 24/7 Manager"
echo "=========================================="
echo

# ---- sanity checks ----
if [ ! -f "package.json" ]; then
    error "package.json not found — run this from the Bot-Panel directory."
    exit 1
fi

if [ ! -f ".env" ]; then
    warn ".env not found. Run 'Setup .env Configuration.sh' or install.sh first."
    exit 1
fi

usage() {
    echo "Usage: $0 {start|stop|restart|status|logs}"
    echo
    echo "  start    Start the panel under the 24/7 supervisor (foreground unless run with pm2)"
    echo "  stop     Stop the running panel"
    echo "  restart  Restart the panel"
    echo "  status   Show whether the panel is running"
    echo "  logs     Tail the panel log"
    exit 1
}

is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid="$(cat "$PID_FILE")"
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

start_with_pm2() {
    info "pm2 detected — using it for process management."
    if pm2 describe "$APP_NAME" &> /dev/null; then
        pm2 restart "$APP_NAME"
    else
        pm2 start npm --name "$APP_NAME" -- start
    fi
    pm2 save
    info "Panel running under pm2 as '${APP_NAME}'."
    echo "  View logs:   pm2 logs ${APP_NAME}"
    echo "  Stop:        pm2 stop ${APP_NAME}"
    echo "  Status:      pm2 status"
    echo
    warn "Run 'pm2 startup' once (as instructed by its output) so the panel survives reboots."
}

start_supervised_loop() {
    if is_running; then
        warn "Panel already appears to be running (PID $(cat "$PID_FILE"))."
        exit 0
    fi

    info "Starting supervised restart-on-crash loop (logs: $LOG_FILE)"
    info "Press Ctrl+C to stop, or run '$0 stop' from another terminal."
    echo

    (
        restart_count=0
        window_start=$(date +%s)

        while true; do
            npm start >> "$LOG_FILE" 2>&1 &
            child_pid=$!
            echo "$child_pid" > "$PID_FILE"
            echo "$(date '+%Y-%m-%d %H:%M:%S') [manager] started panel, pid $child_pid" >> "$LOG_FILE"

            wait "$child_pid"
            exit_code=$?

            now=$(date +%s)
            if (( now - window_start > RESTART_WINDOW )); then
                restart_count=0
                window_start=$now
            fi
            restart_count=$((restart_count + 1))

            echo "$(date '+%Y-%m-%d %H:%M:%S') [manager] panel exited (code $exit_code), restart #$restart_count" >> "$LOG_FILE"

            if (( restart_count > MAX_RESTARTS )); then
                echo "$(date '+%Y-%m-%d %H:%M:%S') [manager] too many restarts (${MAX_RESTARTS} in ${RESTART_WINDOW}s) — giving up" >> "$LOG_FILE"
                rm -f "$PID_FILE"
                exit 1
            fi

            sleep 2
        done
    )
}

stop_panel() {
    if pm2 describe "$APP_NAME" &> /dev/null 2>&1; then
        pm2 stop "$APP_NAME"
        info "Stopped pm2-managed panel."
        return
    fi

    if is_running; then
        local pid
        pid="$(cat "$PID_FILE")"
        kill "$pid" 2>/dev/null && info "Stopped panel (PID $pid)." || warn "Could not stop PID $pid — may already be dead."
        rm -f "$PID_FILE"
    else
        warn "Panel does not appear to be running."
    fi
}

status_panel() {
    if command -v pm2 &> /dev/null && pm2 describe "$APP_NAME" &> /dev/null 2>&1; then
        pm2 status "$APP_NAME"
        return
    fi

    if is_running; then
        info "Panel is running (PID $(cat "$PID_FILE"))."
    else
        warn "Panel is not running."
    fi
}

tail_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        warn "No log file yet at $LOG_FILE."
    fi
}

# ---- command dispatch ----
CMD="${1:-start}"

case "$CMD" in
    start)
        if command -v pm2 &> /dev/null; then
            start_with_pm2
        else
            warn "pm2 not found — falling back to a plain restart-on-crash loop."
            echo -e "${CYAN}Tip: 'npm install -g pm2' gives you reboot-survival and easier log management.${NC}"
            echo
            start_supervised_loop
        fi
        ;;
    stop)
        stop_panel
        ;;
    restart)
        stop_panel
        sleep 1
        "$0" start
        ;;
    status)
        status_panel
        ;;
    logs)
        tail_logs
        ;;
    *)
        usage
        ;;
esac
