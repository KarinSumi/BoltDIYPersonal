import { createHash, randomBytes } from 'crypto'
import { SECURITY_PIN_HASH, IDLE_LOCK_MINUTES, EMERGENCY_KILL_PHRASE } from './config.js'
import { isSystemLocked, setLocked, touchActivity, lastActivityAt } from './state.js'
import { insertAuditEntry } from './db.js'
import { logger } from './logger.js'

let idleTimer: ReturnType<typeof setTimeout> | null = null

export function setPinHash(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(salt + pin).digest('hex')
  return `${salt}:${hash}`
}

export function verifyPin(input: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  const computed = createHash('sha256').update(salt + input).digest('hex')
  return computed === hash
}

export function isLocked(): boolean {
  return isSystemLocked
}

export function unlock(pin: string): boolean {
  if (!SECURITY_PIN_HASH) return true
  const valid = verifyPin(pin, SECURITY_PIN_HASH)
  if (valid) {
    setLocked(false)
    touchActivity()
    resetIdleTimer()
    insertAuditEntry({ agent_id: 'system', chat_id: 'system', action: 'unlock', detail: 'PIN unlock' })
    logger.info('System unlocked via PIN')
  }
  return valid
}

export function lock(): void {
  setLocked(true)
  insertAuditEntry({ agent_id: 'system', chat_id: 'system', action: 'lock', detail: 'System locked' })
  logger.info('System locked')
}

export function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    lock()
  }, IDLE_LOCK_MINUTES * 60 * 1000)
}

export function checkKillPhrase(text: string): boolean {
  if (!EMERGENCY_KILL_PHRASE) return false
  if (text.toLowerCase() === EMERGENCY_KILL_PHRASE.toLowerCase()) {
    insertAuditEntry({ agent_id: 'system', chat_id: 'system', action: 'kill', detail: 'Emergency kill phrase triggered' })
    logger.warn('Emergency kill phrase detected, shutting down')
    process.exit(0)
  }
  return false
}
