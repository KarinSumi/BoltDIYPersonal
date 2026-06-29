# Implementation Plan: NVIDIA NIM Model Fallback & PM2 Process Stability

This document outlines the detailed steps to fix the PM2 crash-restart loop and implement the dynamic model fallback to `deepseek-ai/deepseek-v4-pro` when `deepseek-ai/deepseek-v4-flash` returns 429 rate limit errors.

## Tasks

### 1. Fix PM2 Auto-Restart Loop
- **Modify** `ecosystem.config.cjs`:
  - Change `wait_ready: true` to `wait_ready: false` to stop PM2 from forcefully restarting the bot process when a ready signal is not received.
- **Modify** `src/index.ts`:
  - Send the ready signal using `if (process.send) process.send('ready')` right when startup successfully completes to ensure PM2 process manager compatibility.

### 2. Make Rate-Limit Gate Model-Specific
- **Modify** `src/rate-limit-gate.ts`:
  - Refactor to maintain a `Map` of model names to cooldown states.
  - Update `checkGate` to accept a `model` parameter.
  - Update `tripGate` to accept a `model` and `retryAfterMs` parameter.
  - Update `resetGate` and other helper functions to accept `model`.

### 3. Implement Dynamic Fallback in retryOnRateLimit
- **Modify** `src/opencode-agent.ts`:
  - Update the signature of `retryOnRateLimit` to:
    ```typescript
    export async function retryOnRateLimit<T>(
      initialModel: string,
      fn: (activeModel: string) => Promise<T>,
      maxRetries = 2,
      failFast = false
    ): Promise<T>
    ```
  - Implement fallback from `deepseek-ai/deepseek-v4-flash` to `deepseek-ai/deepseek-v4-pro` when `deepseek-ai/deepseek-v4-flash` is rate-limited (either gate is blocked or returns a `429` error).
  - Check and trip the gate for the specific active model being queried.

### 4. Update retryOnRateLimit Call Sites
- **Modify** `src/opencode-agent.ts`:
  - Update the `retryOnRateLimit` call within `queryAgent` to pass `model` as the first argument, and pass the `activeModel` to `client.chat.completions.create`.
- **Modify** `src/master-orchestrator.ts`:
  - Update the `retryOnRateLimit` call within `runOrchestrator` to pass `model` as the first argument, and pass the `activeModel` to `client.chat.completions.create`.

### 5. Verification
- Run `npm run build` to compile TypeScript code.
- Run tests (`npm run test` or `vitest run`) to check for regressions.
- Restart the bot via PM2 using `npm run pm2:restart`.
- Run `npm run pm2:status` to verify that the restart count does not increment and the process remains stable.
- Send messages to the Telegram bot to verify both direct and orchestrator flows work seamlessly.
