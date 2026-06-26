# OpenCode OS Visual Evolution Plan (BagIdea Office Architecture)

This document outlines the roadmap to transform the current Telegram-based `Open-code-agent` into a living, 3D "BagIdea-style" office that runs on the Windows desktop wallpaper — using bagidea-office's architecture as the target reference.

**Architecture target:** [bagidea/bagidea-office](https://github.com/bagidea/bagidea-office) v0.9.30 — zero-dependency Node.js daemon (port 8787), Rust native shell (tao+wry), Godot 4 3D wallpaper, 18 model providers, plugin system, 6 channels.

**⚠️ CRITICAL DIRECTIVE FOR ALL AGENTS: TEST-DRIVEN DEVELOPMENT (TDD) STRICT MODE ⚠️**
*Do NOT write implementation code before writing tests.*
*Do NOT start a phase before clearing the requirements and establishing the success criteria.*

For every sub-task below, follow this cycle:
1. **Requirements Clear:** Ask clarifying questions to the user about edge cases. Do not assume.
2. **Write Failing Test:** Write the test case first (Node.js built-in `node:test` or Jest-compatible).
3. **Execute & Fail:** Run the test to confirm it fails.
4. **Implement:** Write the minimum code required to pass the test.
5. **Execute & Pass:** Run the test again to confirm success.

---

## Phase 1: Local Daemon & Web Overlay Foundation
**Goal:** Zero-dependency Node.js event-hub daemon (port 8787) with WebSocket overlay, agent registry, and event journal — no Express, no external npm deps. Wrapped in a Rust native desktop shell (tao + wry webview).

- **[ ] Requirement Gathering:** Confirm the WebSocket event schema (OEP format), persistent storage strategy (flat JSON files), and whether to use the Rust shell directly from bagidea-office or build a simpler Node.js shell first.
- **[ ] Zero-Dep HTTP + WebSocket Daemon**
  - *Test Case (`daemon-server.test.js`):* Start the server on a random port, send an HTTP GET to `/api/health`, assert it returns `200 OK` with `{ status: "ok" }`. Send a WebSocket connect, assert it upgrades and echoes back a `connected` event.
  - *Task:* Build the core server using Node.js built-in `http` + `ws` (no Express, no Hono, no third-party deps). This is the foundation — every other layer talks to this.
- **[ ] Event Journal (journal.jsonl)**
  - *Test Case (`journal.test.js`):* Emit 3 events via the daemon, crash the process, restart, and assert the new session replays those 3 events in order.
  - *Task:* Append-only JSONL journal with replay-on-connect for state recovery. Auto-trim stale entries on boot.
- **[ ] Agent Registry (registry.json)**
  - *Test Case (`registry.test.js`):* `POST /api/agents` with a new agent payload, `GET /api/agents` and assert the list includes it. Try deleting the `ceo` agent and assert it's rejected (protected).
  - *Task:* Persistent staff database — name, role, avatar, persona, skills, tools, grants. `main` (Director) and `ceo` are protected and cannot be deleted.
- **[ ] Native Desktop Shell (Rust / tao + wry)**
  - *Test Case (`shell-launch.test.js`):* After build, run the shell binary, assert it opens a transparent window, and the webview loads `http://127.0.0.1:8787/` successfully.
  - *Task:* Rust project using `tao` (window), `wry` (webview), `tray-icon` (system tray). The shell spawns the daemon as a child process and hosts the overlay UI. On Windows, attach the Godot window as wallpaper via WorkerW.
- **[ ] Overlay UI Shell**
  - *Test Case (`overlay-ws.test.js`):* Mock WebSocket client connects, sends a `{"type":"chat","text":"Hello"}`, assert the server responds with a `chat_reply` event on the WS.
  - *Task:* Single HTML file (like bagidea-office's `overlay.html`) served by the daemon — chat panel, agent rail with live status dots, settings, security center. All UI state syncs via WebSocket events.
- **[ ] Real-time State Sync**
  - *Test Case (`state-sync.test.js`):* Emit an `agent_status_change` event internally, assert it broadcasts to all connected WebSocket clients with the correct OEP payload structure `{ type, ts, data, id }`.

**How this maps to bagidea-office:** This replaces Open-code-agent's current Hono dashboard (port 3141) and Telegram-centric architecture with bagidea-office's zero-dep daemon pattern. The old `bot.ts` becomes a channel plugin (Phase 6). The old `dashboard.ts` / Hono server is replaced entirely.

---

## Phase 2: Godot 4 3D Wallpaper Engine
**Goal:** 3D office world (Godot 4 Forward Plus) rendered as a transparent desktop wallpaper behind desktop icons, connected to the daemon via WebSocket.

- **[ ] Requirement Gathering:** Confirm Godot 4 version (target 4.6), asset pipeline (CC0 sprites / 3D models), and whether to reuse bagidea-office's existing Godot project directly or build a lighter variant.
- **[ ] Godot 4 Project Setup & IPC**
  - *Test Case (`godot-ipc.test.js`):* Create a mock Godot WS client that connects to the daemon and asserts it receives an initial `world_state` payload with the room grid and agent positions.
  - *Task:* Initialize Godot project with Forward Plus renderer, 1600×900 borderless transparent window, MSAA 2x, 8K shadow maps. Implement `event_client.gd` — a GDScript WebSocket client connecting to `ws://127.0.0.1:8787/ws`.
- **[ ] Room Grid & World Builder**
  - *Test Case (`world-builder.test.js` — Node):* Send a `room_layout` config via WS, assert the Godot client parses it and emits a `room_placed` confirmation event.
  - *Task (GDScript):* `world_builder.gd` — 3×3 swappable room grid (jigsaw). Rooms: Executive, Operations (6 desks), Lobby, Cafeteria, Server, Meeting (seats face table), Recreation, 2x Dormitories. Each room is an identical cell — any room fits any slot. Furniture, agent anchors, and navigation move with swaps.
- **[ ] Agent Avatars & 3D Pathfinding**
  - *Test Case (`agent-pathing.gd` — GDScript/GUT):* Instantiate an agent at `lobby`, call `move_to("meeting_room")`, assert the `CharacterBody3D` traverses the `AStar3D` graph and reaches within 1 unit of the target in under 120 frames.
  - *Task:* `agent_manager.gd` — Agent lifecycle, A\* pathfinding on a waypoint graph, 4-direction animated sprites (billboarded to camera), state machine (IDLE/WALKING/WORKING/MEETING/BLOCKED/OFFLINE).
- **[ ] Day/Night Cycle & Environment**
  - *Test Case (`day-night.test.js`):* Set system clock to 18:00, restart the daemon, assert the Godot world state includes `phase: "night"`.
  - *Task:* Real-time cycle following the machine clock. Sun, sky color, ambient light, reflections update accordingly. Manual override via overlay (🌗 toggle). 4,200 wind-swaying grass blades, low-poly mountains/trees, cartoon clouds, bird flocks, daytime pollen / night fireflies.
- **[ ] HUD: Nameplates, Status, Effects**
  - *Test Case (`hud-render.test.js`):* Emit an `agent_update` with status `WORKING`, assert the Godot HUD updates the nameplate pill text accordingly.
  - *Task:* `hud.gd` — MMO-style nameplates (portrait, name, role, state pill, distance-scaled). Rank dressing: CEO = gold+crown, Director = blue+star. Event FX flipbooks (✅ ❌ ❗ 👍 👎 🎵 golden burst). Equippable auras (fire/ice/nature/arcane/shadow/gold).
- **[ ] Ghost Deck & Sub-Agents**
  - *Test Case (`ghost-deck.test.js`):* Spawn 3 sub-agents via `SUB:` protocol, assert translucent ghost characters appear on the floating Ghost Deck with status plates, then dissolve back on completion.
  - *Task:* A floating glass platform (12 desks, movable from editor) reached by staircase. Ghost clones materialize, work at desks, then glide home and dissolve. Stuck ghosts reaped after 6 min.
- **[ ] Wallpaper Attachment (WorkerW)**
  - *Test Case (`wallpaper-attach.ps1` — integration):* Launch Godot in windowed mode, run the wallpaper script, assert the window is attached behind desktop icons (not visible in Alt+Tab).
  - *Task:* PowerShell script using `FindWindow`/`SetParent` for WorkerW attachment on Windows. Works alongside the Rust shell.

**How this maps to bagidea-office:** The entire Godot project structure mirrors bagidea-office's `godot/` folder — same scene tree, same GDScript architecture, same shaders, same asset layout. The goal is compatibility: bagidea-office's Godot assets and scenes should be importable with minimal changes.

---

## Phase 3: Swappable Brains & Agent Society
**Goal:** Every agent runs on its own model (18 providers), with a zero-dependency proxy translating Anthropic↔OpenAI formats. Agents hold real meetings and pitch projects.

- **[ ] Requirement Gathering:** Confirm the provider list (start with 5-6, expand to all 18), rate limit for proposals, and default model fallback chain.
- **[ ] Zero-Dependency Proxy (proxy.js)**
  - *Test Case (`proxy.test.js`):* Send an Anthropic-format message to the proxy, mock an OpenAI API response, assert the proxy returns a correctly translated Anthropic-format reply with streaming support.
  - *Task:* A translation layer that converts Anthropic Messages format to/from OpenAI Chat Completions format on the fly. No LiteLLM, no Python, no npm deps. Streaming JSON chunk-by-chunk.
- **[ ] Provider Registry (providers.js)**
  - *Test Case (`providers.test.js`):* Call `getProvider("openai")`, assert it returns the correct base URL and model list endpoint. Call `getProvider("ollama")`, assert it points to `localhost:11434`.
  - *Task:* 18 provider definitions — Claude, GLM, DeepSeek, Qwen, MiniMax, Kimi (direct); OpenAI, Gemini, OpenRouter, NVIDIA, Groq, Cerebras, xAI, Mistral, Together, Fireworks (via proxy); Ollama, LM Studio (local, no key).
- **[ ] Per-Agent Model Assignment**
  - *Test Case (`model-routing.test.js`):* Configure `agent.researcher` with `deepseek-chat`, send a chat message, and assert the request is routed to DeepSeek's API (not the global default).
  - *Task:* Each agent in the registry has a `model` field (provider + model ID). The daemon routes requests per-agent. Falls open to Claude if misconfigured.
- **[ ] Auto-Compact + Auto-New-Thread**
  - *Test Case (`auto-compact.test.js`):* Build a conversation that would exceed a 128K context window, assert the daemon proactively summarizes with Claude, opens a fresh thread, and continues without data loss.
  - *Task:* Before each turn, measure conversation vs model's context window. At 80% threshold, summarize + rotate to a new thread. Also handles backend 429 / context-limit errors reactively.
- **[ ] Agent Society — Idle Chat & Proposals**
  - *Test Case (`idle-chat.test.js`):* Set 3 agents to idle, trigger the `idleTick` cycle, mock the LLM response suggesting an idea, assert a `project_proposal` event is emitted with title + description.
  - *Task:* Background cron for idle agents — they drift to common rooms and hold AI-to-AI chats. Conversations that crystallize into ideas generate a `project_proposal` to the CEO. Rate-limited and configurable (⚙ → AGENTS → PROPOSALS).
- **[ ] Agent Discussions (Meetings)**
  - *Test Case (`meeting.test.js`):* Request a meeting between 2 agents on "architecture review", assert each agent takes a round-robin turn, and a `meeting_minutes` event is emitted at the end.
  - *Task:* Pick 2-4 agents + topic → they hold real meetings over a shared transcript. Minutes appear on the in-world whiteboard. Agents can use tools during meetings for research.

---

## Phase 4: Plugin Architecture
**Goal:** Extensible plugin system — any folder in `plugins/` becomes a UI panel, HTTP route, or agent-accessible command.

- **[ ] Requirement Gathering:** Define the plugin API surface (ctx methods), security model, and whether to support the same format as bagidea-office plugins for cross-compatibility.
- **[ ] Plugin Loader**
  - *Test Case (`plugin-loader.test.js`):* Drop a valid plugin folder into `plugins/test-plugin`, restart the daemon, and assert `GET /api/plugins` lists it with the correct name and description.
  - *Task:* On daemon boot, scan `plugins/` for subdirectories containing `main.js` (or `index.js`). Each plugin exports `{ panels, routes, commands, onStart }`. Panels are appended to the overlay UI, routes are mounted at `/api/plugins/<name>/...`, commands are injected into agent system prompts.
- **[ ] Plugin API (ctx)**
  - *Test Case (`plugin-ctx.test.js`):* Inside a plugin test, call `ctx.broadcast("test_event", { data: 1 })` and assert all connected WS clients receive the event.
  - *Task:* Plugins receive a `ctx` object with: `ctx.registry` (read agents), `ctx.feed` (subscribe to events), `ctx.broadcast(type, data)` (emit to all), `ctx.runClaude(prompt)` (spawn a headless Claude session), `ctx.storage` (private key-value store).
- **[ ] Plugin Hub & GitHub Install**
  - *Test Case (`plugin-install.test.js`):* Run `bagidea plugin install https://github.com/bagidea/bagidea-office-calculator-plugin`, assert the plugin folder is created in `plugins/`, and the endpoint lists it.
  - *Task:* `bagidea plugin install <url>` — clones a GitHub repo into `plugins/`, runs any setup hook, and reloads. Official template repo: `bagidea-office-template`.
- **[ ] Agent Self-Built Plugins**
  - *Test Case (`agent-create-plugin.test.js`):* Invoke the `create_plugin` tool from an agent with mock HTML/JS, assert the file is physically created in `plugins/` and the daemon picks it up after reload.
  - *Task:* Agents can propose and build their own plugins (with CEO approval). Uses the template repo as a starting point.

---

## Phase 5: Voice & Multimedia
**Goal:** Speak to agents and hear them back. 16 voice presets, push-to-talk, realtime voice calls.

- **[ ] Requirement Gathering:** Confirm STT provider (OpenAI Whisper vs local), TTS provider (Gemini), and push-to-talk hotkey (default Right Ctrl).
- **[ ] Push-to-Talk (Global Hotkey)**
  - *Test Case (`audio-capture.test.js`):* Feed a dummy `.wav` buffer into the audio pipeline, assert the daemon transcribes it to text via Whisper and routes it to the Director.
  - *Task:* Hold-to-record in the webview → OpenAI Whisper / Gemini transcription. Right Ctrl hotkey in the native shell. Audio chunks streamed over WebSocket.
- **[ ] Agent TTS (Text-to-Speech)**
  - *Test Case (`tts-router.test.js`):* Configure an agent with `voice: "gemini-female-1"`, send a reply, assert the daemon calls Gemini TTS and streams the binary audio back over WebSocket.
  - *Task:* 16 voice presets (8♀ / 8♂) using Gemini TTS. Per-agent voice assignment. Agents optionally toss out short mood lines ("feeling productive today"). Voice preview introduces itself in the correct gender and office language.
- **[ ] Realtime Voice Calls**
  - *Test Case (`realtime-call.test.js`):* Initiate a call to the main agent, assert a Gemini Live session is established, bridging mic audio to the agent's assigned voice.
  - *Task:* Main agent (only) is callable via Gemini Live. Bridged in the agent's assigned voice. Knowledge from the office is seeded into the call context.
- **[ ] Inline Media Rendering**
  - *Test Case (`media-render.test.js`):* Send a message with an image URL, assert the chat panel renders it inline (not as a file path). Send a `/gen/image` command, assert the generated image appears in chat.
  - *Task:* Images, video, audio render inline in chat. Click image to view full-size. Agents produce images via the `/gen/image` system tool. Paperclip upload / drag-drop.

---

## Phase 6: Channels
**Goal:** Connect 6 messaging platforms — messages enter the Director flow, replies come back on the same channel.

- **[ ] Requirement Gathering:** Order of channel implementation (Telegram first, since Open-code-agent already has a bot), and whether to reuse existing `bot.ts` code.
- **[ ] Telegram Channel**
  *Test Case (`channel-telegram.test.js`):* Mock a Telegram update, feed it to the channel adapter, assert it enters the Director's message queue and a reply is sent back via the Telegram API.
  *Task:* Long-poll adapter (or webhook). Reuses Open-code-agent's existing `bot.ts` logic but refactored as a channel adapter matching bagidea-office's `channels.js` pattern.
- **[ ] Discord Channel**
  *Test Case (`channel-discord.test.js`):* Connect via native Discord gateway, send a message, assert the Director receives it.
  *Task:* Native Discord gateway connection (WebSocket). Message → Director flow → reply on same channel.
- **[ ] LINE / Slack / WhatsApp / Messenger Channels**
  *Test Case (per-channel):* Mock each platform's webhook payload, assert correct routing and reply.
  *Task:* LINE (webhook), Slack (Events API), WhatsApp (Meta Cloud API), Messenger (Meta Graph). All feed into the same Director message pipeline.

---

## Phase 7: Memory & Skills
**Goal:** Token-lean keyword-indexed memory with BM25 retrieval. Hermes-style auto-learned skills.

- **[ ] Requirement Gathering:** Memory hierarchy (shared vs per-agent vs per-project), and whether to retain Open-code-agent's existing SQLite memory or migrate to flat-file BM25.
- **[ ] BM25 Memory Retrieval (retrieval.js)**
  *Test Case (`retrieval.test.js`):* Store 3 memory entries, query with a keyword, assert the BM25 index returns the most relevant entry first.
  *Task:* Pure-JS BM25 (zero deps, Thai-compatible). Three levels: `workspace/OFFICE.md` (shared), `workspace/memory/<id>.md` (per-agent), `workspace/projects/<id>/MEMORY.md` (per-project). Only task-relevant memories are injected (not a blind dump).
- **[ ] Skills Library (skills.js)**
  *Test Case (`skills.test.js`):* Register a `code-review` skill, assign it to an agent, invoke a chat that triggers it, assert the skill's instructions are injected into the prompt (via progressive disclosure) and NOT always loaded.
  *Task:* 11 built-in packs: office-ops, deep-research, office-control, plugin-builder, code-review, doc-writer, debug-detective, data-wrangler, project-kickoff, diagram-maker, archive-search. Delivered on-demand (progressive disclosure).
- **[ ] Hermes-Style Auto-Learning**
  *Test Case (`auto-learn.test.js`):* Complete a multi-tool task (mocked), trigger the reflection pass, assert a new skill file is created in `skills/` and assigned to the agent.
  *Task:* After a completed multi-tool task, a reflection pass determines if the work distills into a reusable skill. If so, it's saved, auto-assigned, and announced in the office.

---

## Phase 8: Security (Spatialized & Permission Broker)
**Goal:** Agents physically walk to Security Center for ungranted tool permissions. Grant-based access control with persistent rules.

- **[ ] Requirement Gathering:** Grant tiers (single-use, ✓✓ forever, per-session), timeout behavior (50s default), and security audit log requirements.
- **[ ] Permission Broker (perm.js)**
  *Test Case (`perm-broker.test.js`):* Register an agent with no grants, invoke a tool call, assert the daemon holds the request and emits a `permission_requested` event. Approve it (✓✓ forever), invoke again, assert it passes silently.
  *Task:* Before a tool executes, check the agent's grants. If ungranted, pause the tool call and emit a permission request event. On approval (single or forever), let it proceed. On deny or 50s timeout, return a failure.
- **[ ] In-World Security Walk**
  *Test Case (`security-walk.gd`):* Mock a permission request, assert the agent character physically walks to the Security Center zone with an amber pulse and ❗ effect over its head.
  *Task:* When a tool needs a permission not yet granted, the agent walks to the Security Center. The overlay's Security Center pops open with the exact command. Tools already granted never trigger a walk (short grace period prevents twitching).
- **[ ] CEO Chain of Command**
  *Test Case (`ceo-chain.test.js`):* Send a message to the CEO, assert the Director intercepts, dispatches sub-tasks via `DELEGATE:` lines, collects results, and walks a summary back.
  *Task:* Ordering the CEO summons the Director. He takes the order, replies with a plan, dispatches via `DELEGATE:` lines. Each spawns a real session. Results report back to Director, who synthesizes and walks the summary to the CEO. Bounded depth, serialized turns.

---

## Phase 9: Projects & Workspaces
**Goal:** Register real folders as projects. Agents work inside them in isolated sessions. One occupant at a time.

- **[ ] Requirement Gathering:** Project path resolution (PLACE aliases like `"room" → D:\Path`), and whether to reuse Open-code-agent's existing kanban/scheduler db tables or replace with flat files.
- **[ ] Project Registry**
  *Test Case (`projects.test.js`):* `POST /api/projects` with name and path, `GET /api/projects` and assert the list includes it. Try removing a project with a running agent, assert it blocks until the agent is stopped.
  *Task:* Projects are folders registered with a name and path. PLACE aliases for shorthand. Agents can create them via `PROJECT:` protocol lines. One occupant at a time — while an agent works it, you can't open it, and vice versa.
- **[ ] Project Dispatch & Isolation**
  *Test Case (`project-dispatch.test.js`):* `DELEGATE: researcher @ my-project :: Research the API` — assert the agent's Claude session spawns inside `my-project/` directory and is resumable by the user.
  *Task:* Agents dispatched to a project run `claude -p` inside that directory. Sessions are resumable. Stopping an agent frees the project for the user to open. Dev servers spawned by agents are cleaned up on project deletion.
- **[ ] Standing Work Orders (Jobs)**
  *Test Case (`jobs.test.js`):* `POST /api/jobs` with `"every": 3600`, assert the job runs every hour, keeps its own resumable thread, and results are logged.
  *Task:* Run now, at a datetime (optionally daily), or every N minutes. Per-agent queue + global concurrency cap. Each job keeps its own resumable Claude session thread.

---

## Phase 10: CLI, Self-Updater & Polish
**Goal:** Full `bagidea` CLI, self-updating (version-gated), startup at login, self-healing watchdog.

- **[ ] Requirement Gathering:** CLI command set (subset of bagidea-office's full CLI), and whether to implement as a Node.js CLI or shell script.
- **[ ] bagidea CLI**
  *Test Case (`cli.test.js`):* Run `bagidea status --json` with the daemon running, assert it returns valid JSON with uptime and agent count.
  *Task:* Commands: `start`/`stop`/`restart`, `startup on|off`, `ask`/`chat`, `status`, `stats`, `agents`, `projects`, `proposals`, `proposal approve|reject`, `plugins`, `plugin install|remove`, `lang`, `say`/`voices`/`image`, `channels`, `keys`, `update`, `version`.
- **[ ] Self-Updater (Version-Gated)**
  *Test Case (`self-update.test.js`):* Set a local VERSION lower than the remote, run `bagidea update`, assert it pulls, rebuilds what changed, and relaunches.
  *Task:* VERSION file marks releases. Daemon compares local vs remote. On version bump, raises in-app banner. `bagidea update` pulls, rebuilds, relaunches. Routine commits never trigger.
- **[ ] Self-Healing Watchdog**
  *Test Case (`watchdog.test.js`):* Kill the daemon process, assert the watchdog respawns it within 5 seconds and state is recovered from the journal.
  *Task:* Watchdog child process monitors the daemon. On crash, respawn automatically. Journal replay ensures no data loss.
- **[ ] Start at Login**
  *Test Case (`startup.test.js`):* Run `bagidea startup on`, assert the appropriate startup entry is created (HKCU Run on Windows, LaunchAgent on macOS, XDG autostart on Linux).
  *Task:* Cross-platform: HKCU Run key (Windows), LaunchAgent (macOS), XDG `~/.config/autostart` (Linux).

---

## Phase 11: Open-code-agent Bridge (Backward Compatibility)
**Goal:** Open-code-agent's existing components (Telegram bot, dashboard, agents, kanban, security, obsidian-sync) bridge into the new architecture rather than being discarded.

- **[ ] Requirement Gathering:** Which existing features to preserve vs deprecate: old dashboard (Hono port 3141), SQLite db, Telegram bot (grammy), kanban system, obsidian sync, existing agent YAML configs, existing `.env` vars.
- **[ ] Legacy Agent Compat Layer**
  *Test Case (`legacy-agent.test.js`):* An existing agent YAML from `agents/dev/main.yaml` loads into the new registry and is accessible via `GET /api/agents`.
  *Task:* Parse existing YAML agent configs and register them in `registry.json`. Map old fields (personality, power_packs) to new fields (persona, skills).
- **[ ] SQLite → Flat File Migration**
  *Test Case (`migrate-sqlite.test.js`):* Run the migration script, assert all SQLite memories are written to `workspace/memory/*.md` and the BM25 index picks them up.
  *Task:* One-time migration: read from existing SQLite tables (memories, turns, missions, tasks), write to bagidea-office's flat-file format. Keep SQLite read-only fallback for existing data.
- **[ ] Old Dashboard Redirect**
  *Test Case (`old-dashboard.test.js`):* Visit `http://127.0.0.1:3141/`, assert it redirects to `http://127.0.0.1:8787/`.
  *Task:* A lightweight shim that serves a 301 redirect or embeds the new overlay in an iframe. Removed once migration is confirmed.
- **[ ] .env Crosswalk**
  *Test Case (`env-crosswalk.test.js`):* Set `TELEGRAM_BOT_TOKEN` in `.env`, assert the Telegram channel adapter reads it from the same env file.
  *Task:* Map old env vars to new: `TELEGRAM_BOT_TOKEN → channel-telegram`, `OPENCODE_API_KEY → provider-openai`, `GOOGLE_API_KEY → provider-gemini`, `DASHBOARD_TOKEN → overlay-auth`. Keep both old and new names functional during migration.

### Sub-Agent Awareness Fixes (Immediate — must pass before Phase 1 starts)
**Goal:** The OpenCode OS agent must know about and acknowledge its own sub-agents. Currently it disclaims them due to 3 bugs in the system prompt chain.

- **[ ] #1: Update AGENTS.md (root system prompt)**
  *Test Case (`agent-knows-subagents.e2e.js`):* Ask the agent "do you have sub-agents?" via the Telegram bot or CLI. Assert the response mentions at least one sub-agent (e.g. `dev`, `research`, `sysops`, `writer`) and does **not** claim to be standalone.
  *Task:* Rewrite `AGENTS.md` to describe the multi-agent team structure (17 agents with hierarchy), the delegation pattern, and that the user is talking to the Master Orchestrator with access to specialists. Keep the conciseness — add a `## Your Team` section.

- **[ ] #2: Fix respondDirect() prompt**
  *Test Case (`direct-prompt-agents.test.js`):* Call `respondDirect()` with a simple query, assert the generated prompt mentions the availability of specialist agents.
  *Task:* In `src/master-orchestrator.ts`, update the `respondDirect()` system prompt (line ~650) from `"You are OpenCode OS, a personal AI assistant."` to include: `"You are the Master Orchestrator of OpenCode OS — a team of specialist agents. You have access to dev, research, sysops, and writer agents with sub-specialties."`

- **[ ] #3: Remove "never reveal internal architecture" suppression**
  *Test Case (`orchestrator-mentions-agents.test.js`):* Call `runOrchestrator()` with a delegation query, assert the response is allowed to mention agent IDs and team structure.
  *Task:* In `src/master-orchestrator.ts` `buildSystemPrompt()`, change the rule from `"Never reveal agent IDs, task IDs, or internal architecture to the user"` to `"The user knows about the team. You may mention other agents by name (dev, research, sysops, writer) when relevant."`

- **[ ] #4: Generate CLAUDE.md files for deployed agents**
  *Test Case (`claude-md-exists.test.js`):* For every directory under `agents/` (excluding `_template`), assert a `CLAUDE.md` file exists with a system prompt describing the agent's role and its place in the team.
  *Task:* Run `agent:create` or write a script that generates `CLAUDE.md` for each existing agent from its `agent.yaml` personality field. Each file should include: `"You are {name}, a specialist agent in the OpenCode OS team. Report to the Master Orchestrator. Your role: {personality}"`

---

## Architecture Reference: Target Layout

After all phases, the project should mirror this bagidea-office-compatible structure:

```
opencode-os/
├── daemon/
│   ├── server.js           # Zero-dep HTTP + WS (port 8787)
│   ├── channels.js          # 6 channel adapters
│   ├── proxy.js             # Anthropic↔OpenAI translation
│   ├── providers.js         # 18 model providers
│   ├── plugins.js           # Plugin loader
│   ├── retrieval.js         # BM25 memory
│   ├── skills.js            # Skill library + auto-learning
│   ├── perm.js              # Permission broker
│   ├── journal.js           # Event sourcing (journal.jsonl)
│   ├── registry.js          # Agent registry (registry.json)
│   ├── maintenance.js       # Trim/cleanup routines
│   ├── watchdog.js          # Self-healing
│   ├── overlay.html         # Full web UI (single file)
│   ├── pluginshub.html      # Plugin marketplace
│   ├── toolshub.html        # MCP tools hub
│   ├── workflow.html        # Workflow builder
│   ├── i18n/                # 14 language locales
│   └── tests/               # Jest/node:test suites
├── godot/                   # Godot 4 project (mirrors bagidea-office)
│   ├── project.godot
│   ├── scenes/
│   ├── scripts/             # 20+ GDScript files
│   ├── shaders/             # 6 GLSL shaders
│   └── assets/              # Sprites, textures, sounds, 3D
├── shell/                   # Rust native shell (tao + wry)
│   ├── Cargo.toml
│   └── src/
├── cli/                     # bagidea CLI (Node.js)
│   └── bagidea.js
├── plugins/                 # Plugin folders (installed)
├── workspace/               # Runtime data
│   ├── OFFICE.md
│   ├── memory/
│   ├── projects/
│   └── uploads/
├── installer/               # Cross-platform setup
├── tools/                   # Wallpaper attachment, system utils
├── docs/                    # Design docs & user guides
├── scripts/                 # Migration helpers (old → new)
├── AGENTS.md
├── VERSION
└── bridge/                  # Open-code-agent backward compat
    ├── legacy-agent-loader.js
    ├── sqlite-migrate.js
    └── env-crosswalk.js
```

---

**Next Steps for the IDE:**
Start with **Phase 1: Local Daemon & Web Overlay Foundation**.
**Do NOT write code until you have written and executed `daemon-server.test.js`.**

Each phase builds on the previous one. The `bridge/` layer (Phase 11) ensures existing Open-code-agent features are preserved during migration — old data isn't lost, old env vars still work, and old agents still show up. The bridge can be developed in parallel with the new architecture.
