#!/usr/bin/env bash
# Prevent sleep, lock screen only, add wake timer
# Usage: chmod +x scripts/keep-awake.sh && sudo ./scripts/keep-awake.sh

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()  { echo -e "${GREEN}✓${RESET} $1"; }
warn(){ echo -e "${YELLOW}⚠${RESET} $1"; }

echo -e "${CYAN}=== OpenCode OS: Keep Awake Setup ===${RESET}\n"

OS="$(uname -s)"

# ── 1. Detect OS ──
if [ "$OS" = "Darwin" ]; then
  echo -e "${YELLOW}[1/3] Preventing macOS sleep...${RESET}"
  # Prevent system sleep while bot is running
  sudo pmset -a sleep 0
  sudo pmset -a hibernatemode 0
  sudo pmset -a displaysleep 30
  ok "Sleep disabled, display sleep after 30min"

  echo -e "${YELLOW}[2/3] Creating wake-up launchd timer (every 4h)...${RESET}"
  PLIST_PATH="/Library/LaunchDaemons/com.opencodeos.keepawake.plist"
  sudo tee "$PLIST_PATH" > /dev/null <<'PLISTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.opencodeos.keepawake</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/logger</string>
        <string>OpenCode OS wake ping</string>
    </array>
    <key>StartInterval</key>
    <integer>14400</integer>
    <key>WakeForEvent</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLISTEOF
  sudo launchctl load -w "$PLIST_PATH"
  ok "Wake timer installed (every 4h)"

  echo -e "${YELLOW}[3/3] Creating caffeinate wrapper...${RESET}"
  CAFFEINATE_SCRIPT="/usr/local/bin/opencode-keepawake"
  sudo tee "$CAFFEINATE_SCRIPT" > /dev/null <<'CAFEOF'
#!/bin/bash
# Keeps system awake while OpenCode OS runs
exec caffeinate -dimsu -w $(pgrep -f "node.*index" | head -1) 2>/dev/null || \
  caffeinate -dimsu -t 86400
CAFEOF
  sudo chmod +x "$CAFFEINATE_SCRIPT"
  ok "Run 'sudo opencode-keepawake &' to keep awake during bot runtime"

elif [ "$OS" = "Linux" ]; then
  echo -e "${YELLOW}[1/3] Preventing Ubuntu/Debian sleep...${RESET}"

  # Disable sleep via systemd (Ubuntu 18.04+)
  if command -v systemctl &>/dev/null; then
    sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target 2>/dev/null || true
    ok "Systemd sleep targets masked"
  fi

  # Also handle via logind
  if [ -f /etc/systemd/logind.conf ]; then
    sudo sed -i 's/^#*HandleLidSwitch=.*/HandleLidSwitch=lock/' /etc/systemd/logind.conf
    sudo sed -i 's/^#*IdleAction=.*/IdleAction=lock/' /etc/systemd/logind.conf
    sudo systemctl restart systemd-logind 2>/dev/null || true
    ok "Lid close = lock only (not sleep)"
  fi

  # Prevent sleep on X11/GNOME
  if command -v gsettings &>/dev/null; then
    gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true
    gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
    gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' 2>/dev/null || true
    ok "GNOME sleep disabled"
  fi

  echo -e "${YELLOW}[2/3] Creating wake-up systemd timer (every 4h)...${RESET}"
  sudo tee /etc/systemd/system/opencodeos-wake.service > /dev/null <<'SERVICEEOF'
[Unit]
Description=OpenCode OS wake ping

[Service]
Type=oneshot
ExecStart=/usr/bin/logger "OpenCode OS wake ping"
SERVICEEOF

  sudo tee /etc/systemd/system/opencodeos-wake.timer > /dev/null <<'TIMEREOF'
[Unit]
Description=Wake OpenCode OS every 4 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=4h
WakeSystem=true

[Install]
WantedBy=timers.target
TIMEREOF

  sudo systemctl daemon-reload
  sudo systemctl enable --now opencodeos-wake.timer 2>/dev/null || warn "Could not enable timer (try: sudo systemctl enable opencodeos-wake.timer)"
  ok "Systemd wake timer installed (every 4h)"

  echo -e "${YELLOW}[3/3] Preventing idle suspend...${RESET}"
  # systemd-inhibit wrapper
  sudo tee /usr/local/bin/opencode-keepawake > /dev/null <<'INHIBITEOF'
#!/bin/bash
# Prevents idle suspend while OpenCode OS is running
exec systemd-inhibit --what=sleep:idle:shutdown --who="opencode-os" --why="Bot running" \
  sleep infinity
INHIBITEOF
  sudo chmod +x /usr/local/bin/opencode-keepawake
  ok "Run 'sudo opencode-keepawake &' to prevent idle suspend"
else
  warn "Unknown OS: $OS — manual configuration needed"
  exit 1
fi

echo ""
echo -e "${CYAN}=== Done ===${RESET}"
echo "The system will NOT sleep automatically."
echo "Screen will turn off after 30 min (settable)."
echo "System wakes every 4 hours for bot checks."
echo "Lock screen is recommended."
echo ""
echo "To revert:"
echo "  macOS: sudo pmset -a sleep 30"
echo "  Linux: sudo systemctl unmask sleep.target suspend.target hibernate.target"
