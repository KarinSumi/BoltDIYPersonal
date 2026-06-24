# OpenCode OS

Personal AI assistant accessible via Telegram with a team of specialist sub-agents, auto-routing, and 8 Power Packs.

> **Status:** Active development — core + auto-routing + agents working

---

## Quick Start

### One-command install (recommended)

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\quickstart.ps1
```

**macOS / Ubuntu:**
```bash
chmod +x scripts/quickstart.sh && ./scripts/quickstart.sh
```

### Manual install

```bash
git clone https://github.com/KarinSumi/BoltDIYPersonal.git
cd BoltDIYPersonal
npm install
npm run build
npm run setup   # interactive .env wizard
npm start
```

Send `/chatid` to your Telegram bot, add the ID to `.env`, restart.

> **Minimum Node.js:** v20+ (uses built-in `node:sqlite`)

### One-command install

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\quickstart.ps1
```

**macOS / Ubuntu:**
```bash
chmod +x scripts/quickstart.sh && ./scripts/quickstart.sh
```

Both scripts check prerequisites, clone, install, build, and run the interactive .env wizard.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Telegram Bot                       │
│  (grammy framework ── message handlers ── auth)      │
└──────────┬──────────────────────────────────────────┘
           │ user message
           ▼
┌──────────────────┐    ┌──────────────────────┐
│   Security Layer  │───▶│   Intent Router       │
│  (PIN / kill /    │    │  (classifyIntent via  │
│   injection guard)│    │   LLM + agent catalog)│
└──────────────────┘    └──────────┬───────────┘
                                   │ routed to best agent
                                   ▼
┌─────────────────────────────────────────────────────┐
│                 opencode-agent.ts                     │
│  (OpenAI-compatible client ── tool-calling loop)     │
│   Tools: read_file, write_file, bash, glob, grep,    │
│           web_search, web_fetch                       │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│              Specialist Agent (by personality)        │
│   dev  │  research  │  sysops  │  writer  │  main    │
│   ─────┼────────────┼──────────┼──────────┼────────  │
│   front│ web        │ deploy   │ doc      │ coordinator│
│   back │ data       │ monitor  │ report   │           │
│   debug│ tech       │ backup   │ edit     │           │
└─────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│                 Database & Services                   │
│  SQLite (WAL)  │  Memory v2  │  Scheduler  │  Dashboard│
│  Mission Ctrl  │  Multi-Agent│  Voice      │  War Room │
│  Meeting Bot   │  WhatsApp   │  Security   │  Audit    │
└─────────────────────────────────────────────────────┘
```

---

## Agent Team (17 agents)

### Coordinator

| Agent | Role | Sub-agents |
|-------|------|------------|
| `main` | General chat, coordination, routing | — |

### Engineering

| Agent | Role | Sub-agents |
|-------|------|------------|
| `dev` | General software engineering | — |
| `dev/frontend` | HTML, CSS, React, Vue, UI/UX | — |
| `dev/backend` | APIs, databases, server logic | — |
| `dev/debug` | Crash analysis, profiling, memory leaks | — |

### Research

| Agent | Role | Sub-agents |
|-------|------|------------|
| `research` | General research & analysis | — |
| `research/web` | Multi-source web searching | — |
| `research/data` | Data analysis, statistics | — |
| `research/tech` | Tech papers, emerging tech | — |

### Operations

| Agent | Role | Sub-agents |
|-------|------|------------|
| `sysops` | System administration | — |
| `sysops/deploy` | CI/CD, Docker, cloud | — |
| `sysops/monitor` | Metrics, logging, alerts | — |
| `sysops/backup` | Backup strategies, recovery | — |

### Writing

| Agent | Role | Sub-agents |
|-------|------|------------|
| `writer` | Documentation & writing | — |
| `writer/doc` | API docs, README, guides | — |
| `writer/report` | Reports, changelogs, releases | — |
| `writer/edit` | Proofreading, grammar, style | — |

All agents use `deepseek-ai/deepseek-v4-flash` by default (configurable per-agent).

---

## Features (8 Power Packs)

| Pack | Status | What it does |
|------|--------|-------------|
| **Core** | ✅ | Telegram bot, AI agent with tool-calling, auth, message queue |
| **Memory v2** | ⚠️ | Gemini-powered memory extraction, embeddings, consolidation, decay — needs `GOOGLE_API_KEY` |
| **Multi-Agent** | ✅ | 17 agents with auto-routing via intent classification |
| **Mission Control** | ✅ | Cron scheduler, mission queue, `/task`, `/mission` commands |
| **Security** | ✅ | PIN lock, kill phrase, injection guard, idle timeout, audit log |
| **Dashboard** | ✅ | Web UI on port 3141 — agents, tasks, missions, audit, live events |
| **Voice** | ❌ | Needs `GROQ_API_KEY` + `ELEVENLABS_API_KEY` |
| **War Room** | ❌ | Multi-agent voice room — needs Python + Deepgram/Cartesia |
| **Meeting Bot** | ❌ | Join/leave meetings — needs Pika/Recall keys |
| **WhatsApp** | ❌ | Stub — needs WhatsApp Business API |

---

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/chatid` | Show your Telegram chat ID |
| `/agents` | List all registered agents |
| `/newchat` | Clear conversation history |
| `/pin <code>` | Unlock the system |
| `/lock` | Lock the system immediately |
| `/voice` | Toggle voice reply mode |
| `/task <agent> <prompt>` | Schedule a one-time task |
| `/mission <title> \| <prompt>` | Queue a mission |
| `/status` | View pending tasks and missions |

Use `@agentname <message>` to force-delegate to any agent (e.g., `@dev/frontend fix the button styling`).

---

## Configuration

Create a `.env` file in the project root. All supported variables:

```env
# === REQUIRED ===
TELEGRAM_BOT_TOKEN=           # From @BotFather
ALLOWED_CHAT_ID=              # Send /chatid to your bot after first run

# === AI API ===
OPENCODE_API_KEY=             # NVIDIA NIM or any OpenAI-compatible API key
OPENCODE_API_BASE_URL=        # https://integrate.api.nvidia.com/v1 (or your provider)
OPENCODE_MODEL=               # Model ID, e.g. deepseek-ai/deepseek-v4-flash

# === Memory v2 (Gemini) ===
GOOGLE_API_KEY=               # From aistudio.google.com (free) — enables memory extraction

# === Voice ===
GROQ_API_KEY=                 # For speech-to-text
ELEVENLABS_API_KEY=           # For text-to-speech
ELEVENLABS_VOICE_ID=          # ElevenLabs voice ID
GRADIUM_API_KEY=              # Alternative STT/TTS provider

# === War Room ===
DEEPGRAM_API_KEY=             # Real-time speech recognition
CARTESIA_API_KEY=             # Voice synthesis for War Room
WARROOM_MODE=live

# === Dashboard ===
DASHBOARD_TOKEN=              # Generate: node -e "crypto.randomBytes(24).toString('hex')"
DASHBOARD_PORT=3141

# === Meeting Bot ===
PIKA_API_KEY=
RECALL_API_KEY=

# === Security ===
SECURITY_PIN_HASH=            # salt:sha256hex — use scripts/setup.mjs to generate
IDLE_LOCK_MINUTES=30
EMERGENCY_KILL_PHRASE=shutdown everything now

# === Runtime ===
LOG_LEVEL=info
AGENT_MAX_TURNS=30
AGENT_TIMEOUT_MS=900000
SHOW_COST_FOOTER=compact
```

---

## API Providers

The default setup uses **NVIDIA NIM** (`https://integrate.api.nvidia.com/v1`) with the `deepseek-ai/deepseek-v4-flash` model (free tier). To use a different provider:

```env
OPENCODE_API_BASE_URL=https://api.openai.com/v1
OPENCODE_MODEL=gpt-4o
OPENCODE_API_KEY=sk-...
```

---

## Security Notes

- `.env` is in `.gitignore` — **never commit secrets**
- The bot has a PIN lock system (`/lock`, `/pin`)
- Unknown `/` commands are rejected before reaching the AI
- Prompt injection patterns are filtered (ignore previous, system prompt, new instructions)
- An emergency kill phrase (`shutdown everything now`) triggers an immediate hard exit
- The idle lock auto-locks after 30 minutes of inactivity
- All security-relevant actions are logged to the audit log

---

## Development

```bash
npm run build          # Compile TypeScript
npm start              # Run the bot
npm run dev            # Run with tsx (hot reload)
npm run status         # Health check
npm run setup          # Interactive setup wizard
npm run seed           # Seed test data (missions, tasks, audit)
npm test               # Run vitest suite
npm run typecheck      # TypeScript check (no emit)
```

---

## Project Structure

```
├── agents/                 # Agent YAML configurations (1 per subdir)
│   ├── _template/          # Template for new agents
│   ├── dev/                # Engineer + sub-agents
│   ├── research/           # Researcher + sub-agents
│   ├── sysops/             # SysAdmin + sub-agents
│   └── writer/             # Writer + sub-agents
├── src/                    # TypeScript source
│   ├── bot.ts              # Telegram bot (grammy)
│   ├── router.ts           # Intent classification engine
│   ├── opencode-agent.ts   # AI agent with tool-calling loop
│   ├── orchestrator.ts     # Multi-agent registry & delegation
│   ├── security.ts         # PIN lock, kill phrase, injection guard
│   ├── scheduler.ts        # Cron task scheduler
│   ├── dashboard.ts        # Web dashboard (Hono + embedded SPA)
│   ├── memory*.ts          # Memory v2 pipeline
│   ├── voice.ts            # STT/TTS integration
│   ├── whatsapp.ts         # WhatsApp stub
│   ├── meet-cli.ts         # Meeting bot CLI
│   ├── mission-cli.ts      # Mission Control CLI
│   └── db.ts               # SQLite database layer
├── scripts/                # Utility scripts
│   ├── setup.mjs           # Interactive .env setup
│   ├── seed.mjs            # Seed test data
│   └── status.ts           # Health check
├── warroom/                # War Room (Python Pipecat server)
├── store/                  # SQLite database (auto-created, gitignored)
├── workspace/              # Working directory (gitignored)
└── ecosystem.config.cjs    # PM2 config
```

---

## License

MIT
