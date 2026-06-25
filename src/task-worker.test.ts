import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuid } from 'uuid'

let dbDir: string

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'opencode-test-'))
  process.env.STORE_DIR = dbDir
  initDatabase(join(dbDir, 'test.sqlite'))
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
})

describe('task-worker DB queries', () => {
  it('should insert and query inter_agent_tasks with session_id', () => {
    const db = getDb()
    const sessionId = uuid()
    const taskId = uuid()

    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(taskId, 'main', 'dev/frontend', 'Build the UI', sessionId)

    const row = db.prepare('SELECT * FROM inter_agent_tasks WHERE id = ?').get(taskId) as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.session_id).toBe(sessionId)
    expect(row.status).toBe('pending')
  })

  it('should pick pending tasks', () => {
    const db = getDb()
    const pending = db.prepare("SELECT * FROM inter_agent_tasks WHERE status = 'pending' ORDER BY created_at ASC").all() as Record<string, unknown>[]
    expect(pending.length).toBeGreaterThanOrEqual(1)
    expect(pending[0].status).toBe('pending')
  })

  it('should mark tasks as running', () => {
    const db = getDb()
    const taskId = uuid()
    const sessionId = uuid()
    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(taskId, 'main', 'dev/frontend', 'test', sessionId)

    db.prepare("UPDATE inter_agent_tasks SET status = 'running' WHERE id = ?").run(taskId)
    const row = db.prepare('SELECT status FROM inter_agent_tasks WHERE id = ?').get(taskId) as { status: string }
    expect(row.status).toBe('running')
  })

  it('should mark tasks as completed with result', () => {
    const db = getDb()
    const taskId = uuid()
    const sessionId = uuid()
    db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(taskId, 'main', 'dev/frontend', 'test', sessionId)

    db.prepare("UPDATE inter_agent_tasks SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?").run('Done!', taskId)
    const row = db.prepare('SELECT status, result FROM inter_agent_tasks WHERE id = ?').get(taskId) as { status: string; result: string }
    expect(row.status).toBe('completed')
    expect(row.result).toBe('Done!')
  })
})
