import { getOpenCodeBaseURL, isOpenCodeServerReady } from './opencode-server.js'
import { TASK_TIMEOUT_OPENCODE_MS } from './config.js'
import { logger } from './logger.js'

export interface OpenCodePromptResult {
  text: string
  sessionId: string
}

// Map chatId → OpenCode sessionId (persists for conversation continuity)
const sessionMap = new Map<string, string>()

interface SessionCreateResponse {
  id: string
  title?: string
}

interface PromptResponse {
  content?: Array<{ type: string; text?: string }>
  output?: string
  text?: string
}

async function apiCall(path: string, method: string, body?: unknown): Promise<unknown> {
  const url = `${getOpenCodeBaseURL()}${path}`

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TASK_TIMEOUT_OPENCODE_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => `(status ${res.status})`)
    throw new Error(`OpenCode API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

async function getOrCreateSession(chatId: string, title?: string): Promise<string> {
  const existing = sessionMap.get(chatId)
  if (existing) return existing

  const session = await apiCall('/session', 'POST', {
    title: title ?? `OpenCode OS — ${chatId}`,
  }) as SessionCreateResponse

  sessionMap.set(chatId, session.id)
  logger.info({ chatId, sessionId: session.id }, 'Created OpenCode session')
  return session.id
}

export async function promptOpenCode(opts: {
  chatId: string
  prompt: string
  sessionTitle?: string
  signal?: AbortSignal
}): Promise<OpenCodePromptResult> {
  if (!isOpenCodeServerReady()) {
    throw new Error('OpenCode server is not available')
  }

  const sessionId = await getOrCreateSession(opts.chatId, opts.sessionTitle)

  logger.info({ chatId: opts.chatId, sessionId, promptLength: opts.prompt.length }, 'Sending prompt to OpenCode')

  const result = await apiCall(`/session/${sessionId}/prompt`, 'POST', {
    parts: [{ type: 'text', text: opts.prompt }],
  }) as PromptResponse

  // Extract text from various response shapes
  let text = ''
  if (result.content && Array.isArray(result.content)) {
    text = result.content
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')
      .trim()
  } else if (result.text) {
    text = result.text.trim()
  } else if (result.output) {
    text = result.output.trim()
  }

  if (!text) text = 'Task completed (no text output).'

  logger.info({ chatId: opts.chatId, sessionId, outputLength: text.length }, 'OpenCode prompt completed')
  return { text, sessionId }
}

export function clearOpenCodeSession(chatId: string): void {
  const sessionId = sessionMap.get(chatId)
  if (sessionId) {
    sessionMap.delete(chatId)
    logger.info({ chatId, sessionId }, 'Cleared OpenCode session')
  }
}

export function listOpenCodeSessions(): Map<string, string> {
  return new Map(sessionMap)
}
