import { getActiveSessions, listSessionTasks, updateSessionCounts, updateSessionStatus } from './orchestrator.js'
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID } from './config.js'
import { logger } from './logger.js'

export interface SessionSummary {
  total: number
  completed: number
  running: number
  pending: number
  lastChangedAt: number
}

const lastReported = new Map<string, string>()
let running = false
let reportTimer: ReturnType<typeof setInterval> | null = null

export function startProgressReporter(): void {
  if (running) return
  running = true
  logger.info('Progress reporter started (every 2 min)')

  checkAndReport()
  reportTimer = setInterval(() => checkAndReport(), 120000)
}

export function stopProgressReporter(): void {
  running = false
  if (reportTimer) {
    clearInterval(reportTimer)
    reportTimer = null
  }
}

export function buildSessionSummary(sessionId: string): SessionSummary {
  const tasks = listSessionTasks(sessionId) as Array<{ status: string }>
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    running: tasks.filter(t => t.status === 'running').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    lastChangedAt: Date.now(),
  }
}

export function formatProgressMessage(userRequest: string, summary: SessionSummary): string {
  const pct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0
  let msg = `📋 *${userRequest.slice(0, 60)}* — ${summary.completed}/${summary.total} (${pct}%)\n`

  if (summary.completed > 0) msg += `✅ Completed: ${summary.completed}\n`
  if (summary.running > 0) msg += `🔄 Running: ${summary.running}\n`
  if (summary.pending > 0) msg += `⏳ Pending: ${summary.pending}\n`

  if (summary.total > 0 && summary.completed === summary.total) {
    msg += '\n✨ All tasks complete!'
  }

  return msg
}

async function checkAndReport(): Promise<void> {
  try {
    const sessions = getActiveSessions() as Array<{
      id: string; user_request: string; task_count: number; completed_count: number
    }>

    for (const session of sessions) {
      updateSessionCounts(session.id)
      const summary = buildSessionSummary(session.id)
      const message = formatProgressMessage(session.user_request, summary)

      const last = lastReported.get(session.id)
      if (last === message) continue

      lastReported.set(session.id, message)

      if (summary.total > 0) {
        await sendTelegramMessage(message)
      }

      if (summary.total > 0 && summary.completed === summary.total) {
        updateSessionStatus(session.id, 'completed')
        lastReported.delete(session.id)
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Progress reporter error')
  }
}

async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return

  const chatIds = ALLOWED_CHAT_ID ? ALLOWED_CHAT_ID.split(',').map(id => id.trim()).filter(Boolean) : []
  if (chatIds.length === 0) return

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  for (const chatId of chatIds) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        logger.warn({ status: resp.status, body: body?.slice(0, 100) }, 'Telegram send failed')
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Failed to send progress update')
    }
  }
}
