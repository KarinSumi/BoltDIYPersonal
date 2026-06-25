import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuid } from 'uuid'
import { buildSessionSummary } from './progress-reporter.js'

let dbDir: string

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'opencode-test-'))
  process.env.STORE_DIR = dbDir
  initDatabase(join(dbDir, 'test.sqlite'))
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
})

describe('progress-reporter', () => {
  it('buildSessionSummary returns correct counts', () => {
    const db = getDb()
    const sessionId = uuid()

    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'completed', datetime('now'))`).run(uuid(), 'main', 'dev/frontend', 'Task 1', sessionId)
    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'running', datetime('now'))`).run(uuid(), 'main', 'dev/backend', 'Task 2', sessionId)
    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`).run(uuid(), 'main', 'research/web', 'Task 3', sessionId)

    const summary = buildSessionSummary(sessionId)
    expect(summary.total).toBe(3)
    expect(summary.completed).toBe(1)
    expect(summary.running).toBe(1)
    expect(summary.pending).toBe(1)
  })

  it('buildSessionSummary returns zeros for unknown session', () => {
    const summary = buildSessionSummary('nonexistent')
    expect(summary.total).toBe(0)
    expect(summary.completed).toBe(0)
    expect(summary.running).toBe(0)
    expect(summary.pending).toBe(0)
  })

  it('formatProgressMessage returns readable text', async () => {
    const { formatProgressMessage } = await import('./progress-reporter.js')
    const msg = formatProgressMessage('Build site', { total: 3, completed: 1, running: 1, pending: 1, lastChangedAt: Date.now() })
    expect(msg).toContain('Build site')
    expect(msg).toContain('1/3')
    expect(msg).toContain('33%')
    expect(msg).toContain('Running')
    expect(msg).toContain('Pending')
  })
})
