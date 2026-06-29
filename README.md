# OpenCode OS

Personal AI assistant as a persistent system service with HTTP/WebSocket daemon, 18 sub-agents, multimodal voice, channel integrations, and a 3D wallpaper engine.

> **Status:** Active development — core daemon, multi-agent routing, and 11-phase architecture in production

---

## Quick Start

```bash
git clone https://github.com/KarinSumi/BoltDIYPersonal.git
cd BoltDIYPersonal
npm install
npm link              # Makes `bagidea` available globally
npm run build
bagidea start
```

Check status, stop, restart:

```bash
bagidea status
bagidea stop
bagidea restart
```

### .env setup

Copy `.env.example` to `.env` and configure at minimum:

```env
# Daemon auth (required for API/WS)
OVERLAY_AUTH=generate_a_random_token_here

# AI provider
OPENCODE_API_KEY=your_api_key
OPENCODE_API_BASE_URL=https://integrate.api.nvidia.com/v1
OPENCODE_MODEL=deepseek-ai/deepseek-v4-flash

# Telegram (if using)
TELEGRAM_BOT_TOKEN=your_token
ALLOWED_CHAT_ID=your_chat_id
```

> **Minimum Node.js:** v20+ (uses built-in `node:sqlite`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLI (bagidea)                                 │
│  start │ stop │ restart │ status │ ask │ agents │ projects │ plugins    │
│  update │ version                                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ spawns / queries
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DAEMON (server.js)                             │
│               HTTP + WebSocket server on port 8787                       │
│               Watchdog auto-restarts on crash (backoff)                  │
└──────┬──────────────────────┬──────────────────────┬────────────────────┘
       │ HTTP                 │ WS                    │ WS audio
       ▼                      ▼                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  overlay.html│    │  Real-time events│    │  Voice Router    │
│  (dashboard) │    │  (chat, perm,    │    │  (push-to-talk,  │
│ pluginshub   │    │   project, job)  │    │   STT/TTS)       │
└──────────────┘    └──────────────────┘    └──────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         CHANNEL INTEGRATIONS                             │
│  Telegram │ Discord │ LINE │ Slack │ WhatsApp │ Messenger               │
│  (ChannelManager loads all with configured credentials)                  │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         SUBSYSTEMS                                       │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Agent Registry│  │ Memory v2   │  │ Skills Lib  │  │ Perm Broker │  │
│  │ (registry.js) │  │ (BM25/RAG)  │  │ (skills/)   │  │ (perm.js)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │Project Reg   │  │ Job Scheduler│  │ Provider     │  │ CEO Chain   │  │
│  │(projects.js) │  │ (jobs.js)    │  │ Router       │  │(orchestrator│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │ + kanban)   │  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  └─────────────┘  │
│  │ Media Engine │  │ Journal      │  │ Society/     │                   │
│  │ (media.js)   │  │ (journal.js) │  │ Multi-Agent  │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         BRIDGE (legacy compat)                           │
│  Legacy YAML Loader │ SQLite Migrator │ 301 Redirect │ Env Crosswalk    │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      OPENCODE AGENT CORE (src/)                          │
│  TypeScript: bot.ts, orchestrator.ts, opencode-agent.ts, memory.ts,     │
│  security.ts, scheduler.ts, dashboard.ts, voice.ts, ceo-chain.ts,       │
│  dispatcher.ts, kanban-worker.ts, llm-client.ts, provider-router        │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ├──────────────────────────────────────┐
       ▼                                      ▼
┌──────────────────┐              ┌──────────────────────┐
│  17 Specialist   │              │  3D Wallpaper Engine │
│  Agents          │              │  (Godot 4)           │
│  (auto-routed)   │              │  daemon/godot-ipc    │
│  dev, research,  │              │  WebSocket bridge    │
│  sysops, writer  │              └──────────────────────┘
└──────────────────┘
```

### Data flow

```
User (Telegram/CLI/WS/Channel)
  → ChannelManager / HTTP API
    → Daemon (server.js)
      → PermissionBroker (check grants)
        → Agent Registry (resolve agent)
          → ProviderRouter (pick LLM)
            → opencode-agent.ts (tool-calling loop)
              → Specialist Agent (by personality)
                → Tools: bash, read, write, grep, glob, web_search, web_fetch
                  → Result → broadcast via WS / channel reply
```

---

## API Reference

The daemon exposes an HTTP API on `http://127.0.0.1:8787` (configurable via `DAEMON_PORT`). All endpoints except `/` and `/plugins` require a Bearer token:

```
Authorization: Bearer <OVERLAY_AUTH>
```

### HTML Pages

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Overlay HTML dashboard |
| `GET` | `/plugins` | Plugin hub HTML |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — returns `{ status: "ok" }` |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List registered agents (from permission broker registry) |
| `GET` | `/api/agents/status` | Get status of all agents |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a chat message — body: `{ "message": "...", "agentId": "..." }` |

### Plugins

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/plugins` | List installed plugins |
| `POST` | `/api/plugins/install` | Install plugin from GitHub URL — body: `{ "url": "https://github.com/..." }` |
| `POST` | `/api/plugins/create` | Create new plugin — body: `{ "name": "...", "files": {...} }` |

### Permissions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/permissions/grants` | Get agent grants — body: `{ "agentId": "..." }` |
| `POST` | `/api/permissions/approve` | Approve permission request — body: `{ "requestId": "...", "permanent": boolean }` |
| `POST` | `/api/permissions/deny` | Deny permission request — body: `{ "requestId": "..." }` |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List registered projects |
| `POST` | `/api/projects` | Register project — body: `{ "name": "...", "path": "...", "description": "...", "aliases": [] }` |
| `POST` | `/api/projects/occupy` | Occupy project — body: `{ "projectId": "...", "agentId": "...", "sessionId": "..." }` |
| `POST` | `/api/projects/release` | Release project — body: `{ "projectId": "..." }` |

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs` | List registered jobs |
| `POST` | `/api/jobs` | Register job — body: `{ "title": "...", "prompt": "...", "schedule": "...", "agentId": "...", "taskType": "...", "priority": number }` |
| `POST` | `/api/jobs/:id/run` | Run a job immediately |

### Memories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/memories` | List memories |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks |

### Audit Log

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit-log` | Get audit log entries |

### Activity

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/activity` | Get activity feed |

### Hive Mind

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hive-mind` | Hive mind status |

### Kanban

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/kanban/boards` | List kanban boards |
| `GET` | `/api/kanban/board/:id` | Get kanban board by ID |

### Events (SSE)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | Server-sent events stream |

### WebSocket

```
ws://host:port/ws
```

The WebSocket provides real-time bidirectional communication:

**Client → Server:**
- `{ "type": "chat", "text": "..." }` — Send a chat message (echoed back)
- `{ "type": "ping" }` — Ping (server replies `{ "type": "pong" }`)
- `{ "type": "audio_chunk", "data": "<base64>", "agentId": "..." }` — Push-to-talk audio

**Server → Client:**
- `{ "type": "connected", "id": "..." }` — Connection acknowledgment
- `{ "type": "chat_reply", "data": { "text": "..." } }` — Chat response
- `{ "type": "pong" }` — Ping response
- `{ "type": "agent_speech", "data": { "agentId": "...", "voiceId": "...", "text": "...", "audioBase64": "...", "duration": number } }` — TTS audio
- `{ "type": "audio_transcribed", "data": { "agentId": "...", "text": "..." } }` — STT result
- Permission/project/job events — broadcast to all connected clients

---

## CLI Reference

The `bagidea` CLI manages the daemon lifecycle and queries the API.

### Commands

| Command | Description |
|---------|-------------|
| `bagidea start` | Start the daemon (spawns `node daemon/server.js` with watchdog) |
| `bagidea stop` | Stop the daemon (sends SIGTERM / taskkill) |
| `bagidea restart` | Stop then start the daemon |
| `bagidea status [--json]` | Show daemon status (running/stopped, PID, uptime, version) |
| `bagidea ask <message>` | Send a message to the AI via the daemon's chat API |
| `bagidea agents [--json]` | List registered agents |
| `bagidea projects` | List registered projects |
| `bagidea plugins` | List installed plugins |
| `bagidea plugins install <url>` | Install a plugin from a GitHub URL |
| `bagidea update` | Self-update from git via `cli/updater.js` |
| `bagidea version` | Show version (from `VERSION` file or `package.json`) |

---

## Configuration

All environment variables are loaded from `.env` in the project root.

### Daemon

| Variable | Default | Description |
|----------|---------|-------------|
| `OVERLAY_AUTH` | — | Bearer token for HTTP API authentication |
| `DAEMON_PORT` | `8787` | HTTP/WebSocket server port |
| `HOST` | `127.0.0.1` | Listen address |
| `SSL_CERT_PATH` | — | Path to SSL certificate (enables HTTPS) |
| `SSL_KEY_PATH` | — | Path to SSL key |
| `DISABLE_OLD_DASHBOARD` | — | Skip legacy 3141 dashboard redirect |
| `STORE_DIR` | `./store` | Data directory (SQLite, registry, PID files) |

### AI Providers

| Variable | Description |
|----------|-------------|
| `OPENCODE_API_KEY` | API key for primary AI provider |
| `OPENCODE_API_BASE_URL` | API base URL (e.g. NVIDIA NIM, OpenAI, custom) |
| `OPENCODE_MODEL` | Default model ID |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google Gemini API key + Memory v2 |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `GROQ_API_KEY` | Groq API key (also used for STT) |
| `XAI_API_KEY` | xAI (Grok) API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `TOGETHER_API_KEY` | Together AI API key |
| `FIREWORKS_API_KEY` | Fireworks AI API key |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `CEREBRAS_API_KEY` | Cerebras API key |
| `GLM_API_KEY` | GLM (Zhipu) API key |
| `QWEN_API_KEY` | Qwen (Alibaba) API key |
| `MINIMAX_API_KEY` | MiniMax API key |
| `KIMI_API_KEY` | Kimi (Moonshot) API key |

### Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `ALLOWED_CHAT_ID` | Authorized Telegram chat ID |

### Voice

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID |
| `GRADIUM_API_KEY` | Alternative STT/TTS provider |

### War Room

| Variable | Description |
|----------|-------------|
| `DEEPGRAM_API_KEY` | Real-time speech recognition |
| `CARTESIA_API_KEY` | Voice synthesis for War Room |
| `WARROOM_MODE` | `live` or `simulated` |

### Dashboard (legacy)

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_TOKEN` | — | Legacy dashboard auth token |
| `DASHBOARD_PORT` | `3141` | Legacy dashboard port |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURITY_PIN_HASH` | — | `salt:sha256hex` — generated by `scripts/setup.mjs` |
| `IDLE_LOCK_MINUTES` | `30` | Auto-lock after inactivity |
| `EMERGENCY_KILL_PHRASE` | `shutdown everything now` | Hard exit trigger |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Pino log level |
| `AGENT_MAX_TURNS` | `30` | Max tool-calling turns per request |
| `AGENT_TIMEOUT_MS` | `900000` | Agent execution timeout |
| `TASK_TIMEOUT_NIM_MS` | `60000` | NIM-specific timeout |
| `TASK_TIMEOUT_OPENCODE_MS` | `900000` | OpenCode agent timeout |
| `SHOW_COST_FOOTER` | `compact` | Token cost display format |

### Channels

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE channel token |
| `LINE_CHANNEL_SECRET` | LINE channel secret |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `SLACK_SIGNING_SECRET` | Slack signing secret |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business API phone ID |
| `WHATSAPP_TOKEN` | WhatsApp access token |
| `MESSENGER_APP_SECRET` | Facebook App Secret for webhook signature verification |
| `MESSENGER_PAGE_ACCESS_TOKEN` | Facebook Messenger token |
| `MESSENGER_VERIFY_TOKEN` | Messenger webhook verify token |

---

## Features (11 Phases)

| # | Phase | Status | Description |
|---|-------|--------|-------------|
| 1 | **Core Daemon** | ✅ | HTTP/WS server, watchdog, PID management, health check |
| 2 | **Agent Registry** | ✅ | Register/list/update/remove agents, protected IDs (ceo, main) |
| 3 | **Multi-Provider LLM Router** | ✅ | 18 providers: Anthropic, OpenAI, Gemini, DeepSeek, Groq, OpenRouter, Cerebras, xAI, Mistral, Together, Fireworks, NVIDIA, GLM, Qwen, MiniMax, Kimi, Ollama, LM Studio |
| 4 | **Multi-Agent Orchestrator** | ✅ | 18 specialist agents with auto-routing via intent classification |
| 5 | **Permission Broker** | ✅ | Agent grants, approve/deny, persistent grants, WebSocket broadcast |
| 6 | **Project Registry** | ✅ | Register, occupy, release projects with session management |
| 7 | **Job Scheduler** | ✅ | Cron-style jobs, register, run-now, priority, recurring tasks |
| 8 | **Plugin System** | ✅ | Install from GitHub, create, list, plugin context with all subsystems |
| 9 | **Skills Library** | ⚠️ | Skills loaded from `skills/` directory with auto-learning (cooldown-gated) |
| 10 | **Channel Integrations** | ⚠️ | Telegram (✅), Discord/LINE/Slack/WhatsApp/Messenger (stubs, loaded on config) |
| 11 | **Voice & Media** | ⚠️ | STT (Groq/Whisper), TTS (ElevenLabs), push-to-talk over WebSocket |
| — | **Memory v2** | ⚠️ | Gemini-powered memory extraction, embeddings, BM25 retrieval, decay |
| — | **CEO Chain** | ✅ | Decompose orders, dispatch to sub-agents, collect results via kanban |
| — | **3D Wallpaper Engine** | ⚠️ | Godot 4 project with WebSocket bridge for real-time 3D visualization |
| — | **War Room** | ❌ | Multi-agent voice room — needs Python + Deepgram/Cartesia |
| — | **Meeting Bot** | ❌ | Join/leave meetings — needs Pika/Recall keys |
| — | **Security Layer** | ✅ | PIN lock, kill phrase, injection guard, idle timeout, audit log |
| — | **Legacy Bridge** | ✅ | YAML loader, SQLite migrator, 301 redirect, env crosswalk |

---

## Agent Team (18 agents)

### Coordinator

| Agent | Role |
|-------|------|
| `main` | General chat, coordination, routing |

### Engineering

| Agent | Role |
|-------|------|
| `dev` | General software engineering |
| `dev/frontend` | HTML, CSS, React, Vue, UI/UX |
| `dev/backend` | APIs, databases, server logic |
| `dev/debug` | Crash analysis, profiling, memory leaks |

### Research

| Agent | Role |
|-------|------|
| `research` | General research & analysis |
| `research/web` | Multi-source web searching |
| `research/data` | Data analysis, statistics |
| `research/tech` | Tech papers, emerging tech |

### Operations

| Agent | Role |
|-------|------|
| `sysops` | System administration |
| `sysops/deploy` | CI/CD, Docker, cloud |
| `sysops/monitor` | Metrics, logging, alerts |
| `sysops/backup` | Backup strategies, recovery |

### Writing

| Agent | Role |
|-------|------|
| `writer` | Documentation & writing |
| `writer/doc` | API docs, README, guides |
| `writer/report` | Reports, changelogs, releases |
| `writer/edit` | Proofreading, grammar, style |

Agents can be force-delegated with `@agentname <message>` (e.g., `@dev/frontend fix the button`).

---

## Built-in Skills

| Skill | Description |
|-------|-------------|
| `office-ops` | Scheduling, coordination, office operations |
| `deep-research` | In-depth research with web search and source aggregation |
| `office-control` | System control and configuration |
| `plugin-builder` | Build plugins for the OpenCode OS ecosystem |
| `code-review` | Review code for bugs, style, best practices |
| `doc-writer` | Write clear, comprehensive documentation |
| `debug-detective` | Systematic debugging and root cause analysis |
| `data-wrangler` | Data processing, transformation, analysis |
| `project-kickoff` | Project initiation and requirements gathering |
| `diagram-maker` | Create diagrams and visualizations (Mermaid, ASCII) |
| `archive-search` | Search archived conversations and historical data |

---

## Project Structure

```
├── daemon/                  # HTTP/WS server & subsystems
│   ├── server.js            # HTTP + WebSocket server (port 8787)
│   ├── watchdog.js          # Auto-restart with exponential backoff
│   ├── registry.js          # Agent registry (JSON-backed)
│   ├── provider-router.js   # Multi-LLM provider router
│   ├── providers.js         # 18 LLM provider configurations
│   ├── perm.js              # Permission broker (grants, approve/deny)
│   ├── projects.js          # Project registry (occupy/release)
│   ├── jobs.js              # Job scheduler (cron, run-now)
│   ├── skills.js            # Skills library (loaded from skills/ directory)
│   ├── channels.js          # Channel manager (Telegram, Discord, LINE, Slack, WhatsApp, Messenger)
│   ├── channels/            # Individual channel adapters
│   ├── voice-router.js      # Voice routing (STT/TTS per agent)
│   ├── voice.js             # Voice manager (synthesize, transcribe)
│   ├── media.js             # Media processing engine
│   ├── journal.js           # Event journal
│   ├── society.js           # Multi-agent society coordination
│   ├── plugins.js           # Plugin manager (install GitHub, create)
│   ├── plugin-ctx.js        # Plugin runtime context
│   ├── project-dispatch.js  # Project-based task dispatcher
│   ├── retrieval.js         # BM25 retrieval for memory
│   ├── compact.js           # Context compaction
│   ├── proxy.js             # API proxy (Anthropic ↔ OpenAI format)
│   ├── overlay.html         # Overlay HTML dashboard
│   ├── pluginshub.html      # Plugin hub HTML
│   └── *.test.js            # Vitest test files
├── bridge/                  # Legacy compatibility
│   ├── legacy-agent-loader.js  # Load YAML agent configs
│   ├── sqlite-migrate.js       # SQLite schema migrator
│   ├── old-dashboard.js        # 301 redirect for port 3141
│   └── env-crosswalk.js        # Map old env vars to new
├── cli/                     # CLI tools
│   ├── bagidea.js            # Main CLI (start, stop, status, ask, agents, etc.)
│   ├── updater.js            # Git-based self-updater
│   └── *.test.js
├── src/                     # TypeScript source (legacy bot core)
│   ├── bot.ts               # Telegram bot (grammy)
│   ├── router.ts            # Intent classification engine
│   ├── opencode-agent.ts    # AI agent with tool-calling loop
│   ├── orchestrator.ts      # Multi-agent registry & delegation
│   ├── ceo-chain.ts         # CEO order decomposition & dispatch
│   ├── dispatcher.ts        # Task dispatcher
│   ├── kanban-worker.ts     # Kanban board worker
│   ├── security.ts          # PIN lock, kill phrase, injection guard
│   ├── scheduler.ts         # Cron scheduler
│   ├── dashboard.ts         # Legacy web dashboard (Hono + embedded SPA)
│   ├── memory.ts            # Memory v2 (Gemini embeddings, BM25)
│   ├── voice.ts             # STT/TTS integration
│   ├── llm-client.ts        # LLM client wrapper
│   ├── config.ts            # Env config loader
│   ├── db.ts                # SQLite database (WAL mode)
│   ├── events.ts            # Event system
│   ├── logger.ts            # Pino logger
│   ├── heartbeat.ts         # Health heartbeat
│   ├── telegram.ts          # Telegram helper
│   ├── whatsapp.ts          # WhatsApp stub
│   ├── index.ts             # Legacy entry point
│   └── types/               # TypeScript types
├── agents/                  # Agent YAML configurations
│   ├── _template/
│   ├── dev/
│   ├── research/
│   ├── sysops/
│   └── writer/
├── skills/                  # Custom skill files (JSON/MD, auto-learned)
├── plugins/                 # Installed plugins (gitignored)
├── godot/                   # 3D Wallpaper Engine
│   ├── project.godot
│   ├── scenes/
│   ├── scripts/
│   ├── shaders/
│   └── assets/
├── scripts/                 # Utility scripts
│   ├── setup.ts             # Interactive .env wizard
│   ├── status.ts            # Health check
│   ├── seed.mjs             # Seed test data
│   ├── quickstart.ps1       # Windows one-command install
│   ├── quickstart.sh        # macOS/Linux one-command install
│   └── keep-awake.*         # Keep-alive scripts
├── warroom/                 # War Room (Python Pipecat server)
├── docs/                    # Documentation
│   └── superpowers/
├── tools/                   # Agent tool definitions
├── shell/                   # Shell scripts
├── store/                   # Runtime data (gitignored)
│   ├── registry.json        # Agent registry
│   └── *.db                 # SQLite databases
├── workspace/               # Working directory (gitignored)
├── .antigravitycli/         # .antigravity CLI config
├── ecosystem.config.cjs     # PM2 config
├── VERSION                  # Version file
└── vitest.config.ts         # Test config
```

---

> **Note:** `npm start` runs the legacy Telegram bot entry point. Use `bagidea start` to run the daemon-based API server.

## Development

```bash
npm run build              # Compile TypeScript
npm run dev                # Run with tsx (hot reload)
npm run setup              # Interactive setup wizard
npm run seed               # Seed test data
npm test                   # Run vitest suite
npm run typecheck          # TypeScript check (no emit)
npm run status             # Health check

# Daemon lifecycle (via bagidea)
bagidea start              # Start daemon with watchdog
bagidea stop               # Stop daemon
bagidea restart            # Restart daemon
bagidea status --json      # Status in JSON format
bagidea ask "hello"        # Send message to AI

# Legacy PM2 (alternative)
npm run pm2:start
npm run pm2:stop
npm run pm2:status
```

---

## Security Notes

- `.env` is in `.gitignore` — **never commit secrets**
- All HTTP API endpoints (except `/` and `/plugins`) require `Authorization: Bearer <OVERLAY_AUTH>`
- WebSocket connections are unauthenticated by default — secure at network level
- Rate limiting is applied per agent via `rate-limit-gate.ts`
- PIN lock system (`/lock`, `/pin`) for Telegram
- Prompt injection patterns are filtered (ignore previous, system prompt, new instructions)
- Emergency kill phrase triggers immediate hard exit
- Idle timer auto-locks after 30 minutes
- All security events logged to audit journal
- Agent IDs `ceo` and `main` are protected from deletion

---

## API Providers

The system supports 18 LLM providers via `daemon/providers.js`:

| Provider | Env Key | Default Model |
|----------|---------|---------------|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Google Gemini | `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras-llama-3.3-70b` |
| xAI (Grok) | `XAI_API_KEY` | `grok-2` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` |
| Together AI | `TOGETHER_API_KEY` | `together-gpt-4o` |
| Fireworks AI | `FIREWORKS_API_KEY` | `llama-v3p3-70b-instruct` |
| NVIDIA NIM | `NVIDIA_API_KEY` | `llama-3.1-70b-instruct` |
| GLM (Zhipu) | `GLM_API_KEY` | `glm-4-plus` |
| Qwen (Alibaba) | `QWEN_API_KEY` | `qwen-max` |
| MiniMax | `MINIMAX_API_KEY` | `minimax-text-01` |
| Kimi (Moonshot) | `KIMI_API_KEY` | `moonshot-v1-128k` |
| Ollama (Local) | — | `llama3.2` |
| LM Studio (Local) | — | `local-model` |

The `ProviderRouter` picks the provider based on each agent's configured model. Local providers (Ollama, LM Studio) auto-discover available models on startup.

---

## License

MIT
