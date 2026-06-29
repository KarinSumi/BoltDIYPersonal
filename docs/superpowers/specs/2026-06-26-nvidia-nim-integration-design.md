# Design Spec: NVIDIA NIM Rate Limit & PM2 Stability Improvements

This document specifies the technical design to resolve the NVIDIA NIM rate limit errors and the Telegram bot responsiveness issue (crash-restart loop).

## 1. Problem Statement
1. **NVIDIA NIM 429 Error**: Calls to `deepseek-ai/deepseek-v4-flash` via the NVIDIA NIM API with the provided API key consistently return `429 Too Many Requests` (body: `{"status":429,"title":"Too Many Requests"}`). However, calls to `deepseek-ai/deepseek-v4-pro` succeed immediately with `200 OK`.
2. **PM2 Restart Loop**: PM2 is configured with `wait_ready: true` in `ecosystem.config.cjs`, but the application never calls `process.send('ready')`. As a result, PM2 kills and restarts the bot process every 30 seconds. This crash-loop prevents the Telegram bot from answering commands and causes message queue hangs.

---

## 2. Proposed Changes

### Component 1: PM2 Configuration & Process Ready Signal
- **File**: [ecosystem.config.cjs](file:///D:/Opencode-live/Open-code-agent/ecosystem.config.cjs)
  - Change `wait_ready` from `true` to `false` (or remove it) to prevent PM2 from forcefully restarting the process when it doesn't receive a ready signal.
- **File**: [src/index.ts](file:///D:/Opencode-live/Open-code-agent/src/index.ts)
  - Send the ready signal using `if (process.send) process.send('ready')` once the bot has successfully started, ensuring PM2 compatibility.

### Component 2: Model Configuration & Fallback
- **File**: [.env](file:///D:/Opencode-live/Open-code-agent/.env)
  - Update `OPENCODE_MODEL` to `deepseek-ai/deepseek-v4-pro` since the flash model is rate-limited on NVIDIA's side for the developer key.
- **File**: [src/opencode-agent.ts](file:///D:/Opencode-live/Open-code-agent/src/opencode-agent.ts)
  - Implement an automatic model fallback mechanism: if the primary model (e.g., `deepseek-ai/deepseek-v4-flash`) returns a `429` error, temporarily fall back to `deepseek-ai/deepseek-v4-pro` to ensure high availability.

---

## 3. Technical Approaches & Trade-offs

### Approach A: Static Model Update to Pro (Recommended)
- **Description**: Update `.env` model to `deepseek-ai/deepseek-v4-pro` and fix the PM2 startup configuration.
- **Pros**: Simple, highly reliable, no extra complex code, immediate resolution.
- **Cons**: Pro model is slower and uses more tokens/credits than the flash model.

### Approach B: Dynamic Failover / Fallback
- **Description**: Keep `deepseek-ai/deepseek-v4-flash` as primary, but if it returns a 429, retry with `deepseek-ai/deepseek-v4-pro`.
- **Pros**: Automatically uses the faster flash model when available.
- **Cons**: Higher complexity in the LLM client request pipeline.

---

## 4. Verification Plan
- Run standalone test script to ensure correct response.
- Start bot under PM2 and monitor stability using `pm2 status` to verify the restart count stays at 0.
- Send messages ("Hi" and "What is your model?") in Telegram to verify successful responses.
