import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuid } from 'uuid'
import { createSession, getDelegationSession, listSessionTasks, updateSessionStatus, createDelegateTask } from './orchestrator.js'

let dbDir: string

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'opencode-test-'))
  process.env.STORE_DIR = dbDir
  initDatabase(join(dbDir, 'test.sqlite'))
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
})

describe('delegation sessions', () => {
  it('should create and retrieve a delegation session', () => {
    const sessionId = createSession('test-chat', 'Build a website')
    const session = getDelegationSession(sessionId)
    expect(session).toBeTruthy()
    expect(session!.chat_id).toBe('test-chat')
    expect(session!.user_request).toBe('Build a website')
    expect(session!.status).toBe('active')
  })

  it('should get tasks for a session', () => {
    const sessionId = createSession('test-chat', 'Multi-step project')

    createDelegateTask('main', 'dev/frontend', 'Build UI', sessionId, 'Frontend')
    createDelegateTask('main', 'dev/backend', 'Build API', sessionId, 'Backend')

    const tasks = listSessionTasks(sessionId) as Array<{ title: string; status: string }>
    expect(tasks.length).toBe(2)
    expect(tasks[0].title).toBe('Frontend')
    expect(tasks[1].title).toBe('Backend')
  })

  it('should update session status', () => {
    const sessionId = createSession('test-chat', 'Test update')
    updateSessionStatus(sessionId, 'completed')
    const session = getDelegationSession(sessionId)
    expect(session!.status).toBe('completed')
  })
})
