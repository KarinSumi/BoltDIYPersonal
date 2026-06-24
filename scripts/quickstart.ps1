<#
.SYNOPSIS
  OpenCode OS Quickstart — clone, configure, and launch
.DESCRIPTION
  Clones the repo, installs dependencies, runs the interactive setup wizard,
  builds, and starts the bot. No secrets are hardcoded — everything is prompted.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/quickstart.ps1

  Requirements:
    - Node.js >= 20 (check: node --version)
    - Git (check: git --version)
    - Telegram bot token from @BotFather
    - NVIDIA NIM API key (or any OpenAI-compatible API key)
#>

$Host.UI.RawUI.WindowTitle = 'OpenCode OS — Quickstart'

$GREEN = '✓'
$YELLOW = '⚠'
$RED = '✗'
$RESET = ''

function Ok($msg) { Write-Host "$GREEN $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "$YELLOW $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "$RED $msg" -ForegroundColor Red }

Write-Host @"

  ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝
 ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
              OpenCode OS — Personal AI Assistant
"@ -ForegroundColor Cyan

Write-Host "Quickstart Setup`n" -ForegroundColor White

# ── Step 0: Check prerequisites ──
Write-Host "── Checking prerequisites ──" -ForegroundColor Yellow

try {
  $nodeVer = node --version
  $major = [int]($nodeVer -replace '[v.]',' ' -split ' ')[1]
  if ($major -ge 20) { Ok "Node.js $nodeVer" } else { Fail "Node.js $nodeVer (need >= 20)" }
} catch { Fail "Node.js not found. Install from https://nodejs.org (v20+)"; exit 1 }

try {
  $gitVer = git --version
  Ok "Git $gitVer"
} catch { Fail "Git not found. Install from https://git-scm.com"; exit 1 }

# ── Step 1: Clone ──
Write-Host "`n── Cloning repository ──" -ForegroundColor Yellow
$repoUrl = "https://github.com/KarinSumi/BoltDIYPersonal.git"
$targetDir = Join-Path (Get-Location) "BoltDIYPersonal"

if (Test-Path $targetDir) {
  Warn "Directory '$targetDir' already exists. Using it."
  Set-Location $targetDir
} else {
  git clone $repoUrl $targetDir
  if ($LASTEXITCODE -ne 0) { Fail "Clone failed"; exit 1 }
  Set-Location $targetDir
  Ok "Repository cloned"
}

# ── Step 2: Install dependencies ──
Write-Host "`n── Installing dependencies ──" -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install failed"; exit 1 }
Ok "Dependencies installed"

# ── Step 3: Build ──
Write-Host "`n── Building ──" -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Fail "Build failed"; exit 1 }
Ok "Build successful"

# ── Step 4: Setup .env ──
Write-Host "`n── Configuration ──" -ForegroundColor Yellow
Write-Host "You will now be guided through creating your .env file.`n" -ForegroundColor White

$botToken = Read-Host "Telegram bot token (from @BotFather)"
if ([string]::IsNullOrWhiteSpace($botToken)) { Fail "Bot token is required"; exit 1 }

$apiKey = Read-Host "NVIDIA NIM API key (from opencode providers list)"
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  $apiKey = Read-Host "OpenAI-compatible API key"
  if ([string]::IsNullOrWhiteSpace($apiKey)) { Fail "API key is required"; exit 1 }
}

$apiBase = Read-Host "API base URL (press Enter for default: https://integrate.api.nvidia.com/v1)"
if ([string]::IsNullOrWhiteSpace($apiBase)) { $apiBase = "https://integrate.api.nvidia.com/v1" }

$model = Read-Host "Model name (press Enter for default: deepseek-ai/deepseek-v4-flash)"
if ([string]::IsNullOrWhiteSpace($model)) { $model = "deepseek-ai/deepseek-v4-flash" }

$addGoogle = Read-Host "Add Google API key for Memory v2? (y/N)"
$googleKey = ""
if ($addGoogle -eq "y" -or $addGoogle -eq "Y") {
  $googleKey = Read-Host "Google API key (from aistudio.google.com)"
}

# Generate dashboard token
$dashToken = -join ((48..57) + (97..102) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

$envContent = @"
# === REQUIRED ===
TELEGRAM_BOT_TOKEN=$botToken
ALLOWED_CHAT_ID=

# === AI API (NVIDIA NIM) ===
OPENCODE_API_KEY=$apiKey
OPENCODE_API_BASE_URL=$apiBase
OPENCODE_MODEL=$model

# === Memory v2 (Gemini) ===
GOOGLE_API_KEY=$googleKey

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
DASHBOARD_TOKEN=$dashToken
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
"@

Set-Content -Path ".env" -Value $envContent -Encoding ASCII
Ok ".env file created"
Write-Host "Dashboard token: $dashToken" -ForegroundColor Green
Write-Host "  (save this — you'll need it to access the dashboard)" -ForegroundColor Yellow

# ── Step 5: Next steps ──
Write-Host @"

── Setup Complete ──

Next steps:

  1. Start the bot:
     npm start

  2. Open Telegram and send /chatid to your bot (@SCAL_CLI_BOT or your bot's handle)

  3. Edit .env and add the chat ID:
     ALLOWED_CHAT_ID=your_chat_id_here

  4. Restart the bot (Ctrl+C, then npm start)

  5. Open the dashboard:
     http://localhost:3141/?token=$dashToken

  6. Try it:
     - Send a message — auto-routing picks the best agent
     - /agents — see all 17 agents
     - @dev explain the project structure
     - /lock — lock with PIN (default PIN: 1234)

  Need help? https://github.com/KarinSumi/BoltDIYPersonal/issues
"@ -ForegroundColor Cyan

Set-Location ..
