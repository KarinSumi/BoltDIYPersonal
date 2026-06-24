#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/KarinSumi/BoltDIYPersonal.git"
TARGET_DIR="${1:-BoltDIYPersonal}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()  { echo -e "${GREEN}✓${RESET} $1"; }
warn(){ echo -e "${YELLOW}⚠${RESET} $1"; }
fail(){ echo -e "${RED}✗${RESET} $1"; exit 1; }

cat <<'EOF'

  ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝
 ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
              OpenCode OS — Personal AI Assistant

EOF

echo -e "${CYAN}Quickstart Setup${RESET}\n"

# ── Step 0: Check prerequisites ──
echo -e "${YELLOW}── Checking prerequisites ──${RESET}"

if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$MAJOR" -ge 20 ]; then
    ok "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER (need >= 20)"
  fi
else
  fail "Node.js not found. Install from https://nodejs.org (v20+)"
fi

if command -v git &>/dev/null; then
  ok "Git $(git --version | cut -d' ' -f3)"
else
  fail "Git not found. Install with: apt install git (Ubuntu) or brew install git (macOS)"
fi

# ── Step 1: Clone ──
echo -e "\n${YELLOW}── Cloning repository ──${RESET}"

if [ -d "$TARGET_DIR" ]; then
  warn "Directory '$TARGET_DIR' already exists. Using it."
  cd "$TARGET_DIR"
else
  git clone "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
  ok "Repository cloned"
fi

# ── Step 2: Install dependencies ──
echo -e "\n${YELLOW}── Installing dependencies ──${RESET}"
npm install
ok "Dependencies installed"

# ── Step 3: Build ──
echo -e "\n${YELLOW}── Building ──${RESET}"
npm run build
ok "Build successful"

# ── Step 4: Setup .env ──
echo -e "\n${YELLOW}── Configuration ──${RESET}"
echo -e "You will now be guided through creating your .env file.\n"

printf "Telegram bot token (from @BotFather): "
read -r BOT_TOKEN
if [ -z "$BOT_TOKEN" ]; then fail "Bot token is required"; fi

printf "NVIDIA NIM API key (from opencode providers list): "
read -r API_KEY
if [ -z "$API_KEY" ]; then
  printf "OpenAI-compatible API key: "
  read -r API_KEY
  if [ -z "$API_KEY" ]; then fail "API key is required"; fi
fi

printf "API base URL (press Enter for default: https://integrate.api.nvidia.com/v1): "
read -r API_BASE
if [ -z "$API_BASE" ]; then API_BASE="https://integrate.api.nvidia.com/v1"; fi

printf "Model name (press Enter for default: deepseek-ai/deepseek-v4-flash): "
read -r MODEL
if [ -z "$MODEL" ]; then MODEL="deepseek-ai/deepseek-v4-flash"; fi

printf "Add Google API key for Memory v2? (y/N): "
read -r ADD_GOOGLE
GOOGLE_KEY=""
if [ "$ADD_GOOGLE" = "y" ] || [ "$ADD_GOOGLE" = "Y" ]; then
  printf "Google API key (from aistudio.google.com): "
  read -r GOOGLE_KEY
fi

DASH_TOKEN=$(openssl rand -hex 24 2>/dev/null || node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")

cat > .env << ENVEOF
# === REQUIRED ===
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
ALLOWED_CHAT_ID=

# === AI API (NVIDIA NIM) ===
OPENCODE_API_KEY=$API_KEY
OPENCODE_API_BASE_URL=$API_BASE
OPENCODE_MODEL=$MODEL

# === Memory v2 (Gemini) ===
GOOGLE_API_KEY=$GOOGLE_KEY

# === Voice: STT ===
GROQ_API_KEY=

# === Voice: TTS ===
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
GRADIUM_API_KEY=

# === War Room ===
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
WARROOM_MODE=live

# === Dashboard ===
DASHBOARD_TOKEN=$DASH_TOKEN
DASHBOARD_PORT=3141

# === Meeting Bot ===
PIKA_API_KEY=
RECALL_API_KEY=

# === Security (all optional) ===
# SECURITY_PIN_HASH=salt:hash
# IDLE_LOCK_MINUTES=30
# EMERGENCY_KILL_PHRASE=shutdown everything now

# === Runtime ===
LOG_LEVEL=info
AGENT_MAX_TURNS=30
AGENT_TIMEOUT_MS=900000
SHOW_COST_FOOTER=compact
ENVEOF

ok ".env file created"
echo -e "${GREEN}Dashboard token: $DASH_TOKEN${RESET}"
echo -e "${YELLOW}  (save this — you'll need it to access the dashboard)${RESET}"

# ── Step 5: Next steps ──
echo -e "${CYAN}
── Setup Complete ──

Next steps:

  1. Start the bot:
     npm start

  2. Open Telegram and send /chatid to your bot

  3. Edit .env and add the chat ID:
     ALLOWED_CHAT_ID=your_chat_id_here

  4. Restart the bot (Ctrl+C, then npm start)

  5. Open the dashboard:
     http://localhost:3141/?token=$DASH_TOKEN

  6. Try it:
     - Send a message — auto-routing picks the best agent
     - /agents — see all 17 agents
     - @dev explain the project structure
     - /lock — lock with PIN (default PIN: 1234)

  Need help? https://github.com/KarinSumi/BoltDIYPersonal/issues
${RESET}"
