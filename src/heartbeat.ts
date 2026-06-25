import { getDb, initDatabase } from './db.js'
import { lastActivityAt } from './state.js'
import { getClient, resetClient } from './llm-client.js'
import { logger } from './logger.js'
import { heartbeatAgent } from './kanban-db.js'
import { emitHeartbeat } from './events.js'

const CHECK_INTERVAL = 30_000
const STALE_THRESHOLD = 120_000
const MAX_CONSECUTIVE_DOWN = 3
let timer: ReturnType<typeof setInterval> | null = null
let consecutiveDown = 0

export function startHeartbeat(): void {
  if (timer) return
  consecutiveDown = 0
  timer = setInterval(check, CHECK_INTERVAL)
  logger.info('Heartbeat started (30s interval)')
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function getConsecutiveDown(): number {
  return consecutiveDown
}

async function check(): Promise<void> {
  const checks: string[] = []

  try {
    const db = getDb()
    db.prepare('SELECT 1').get()
    checks.push('db:ok')
  } catch {
    checks.push('db:FAIL')
    logger.error('Heartbeat: DB health check failed, attempting re-init')
    try {
      initDatabase()
      checks[checks.length - 1] = 'db:recovered'
    } catch {
      logger.error('Heartbeat: DB re-init also failed')
    }
  }

  try {
    getClient()
    checks.push('llm:ok')
  } catch {
    checks.push('llm:FAIL')
    logger.error('Heartbeat: LLM client check failed, resetting client')
    resetClient()
    try {
      getClient()
      checks[checks.length - 1] = 'llm:recovered'
    } catch {
      logger.error('Heartbeat: LLM client still failing after reset')
    }
  }

  const idle = Date.now() - lastActivityAt
  if (idle > STALE_THRESHOLD) {
    checks.push(`idle:${Math.round(idle / 1000)}s`)
    logger.warn({ idleSeconds: Math.round(idle / 1000) }, 'Heartbeat: system idle for extended period')
  } else {
    checks.push('active')
  }

  try {
    heartbeatAgent('main')
    checks.push('agent_touch:ok')
  } catch {
    checks.push('agent_touch:FAIL')
  }

  const hasFail = checks.some(c => c.includes('FAIL'))
  const allFail = checks.filter(c => c.includes('FAIL')).length >= 3
  const hbStatus: 'ok' | 'degraded' | 'down' = allFail ? 'down' : hasFail ? 'degraded' : 'ok'

  if (hbStatus === 'down') {
    consecutiveDown++
    if (consecutiveDown >= MAX_CONSECUTIVE_DOWN) {
      logger.error({ consecutiveDown }, 'Heartbeat: too many consecutive down checks, exiting')
      emitHeartbeat(hbStatus)
      process.exit(1)
    }
  } else {
    consecutiveDown = 0
  }

  emitHeartbeat(hbStatus)
  logger.debug({ checks: checks.join(', '), consecutiveDown }, 'Heartbeat status')
}
