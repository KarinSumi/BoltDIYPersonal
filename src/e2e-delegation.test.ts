import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { registerMainAgent, createSession, createDelegateTask, listSessionTasks, getDelegationSession, updateSessionCounts, updateSessionStatus, listPendingTasks } from './orchestrator.js'
import { classifyComplexity } from './master-orchestrator.js'
import { startTaskWorker, stopTaskWorker } from './task-worker.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn().mockResolvedValue({ text: 'Mock result for delegated task' }),
}))

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('e2e: full delegation pipeline', () => {
  let dbDir: string
  let sessionId: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-e2e-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
    registerMainAgent()
  })

  afterAll(() => {
    stopTaskWorker()
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('1: classifyComplexity — simple vs complex', () => {
    expect(classifyComplexity('hi')).toBe('direct')
    expect(classifyComplexity('')).toBe('direct')
    expect(classifyComplexity('thanks')).toBe('direct')

    expect(classifyComplexity('Build a todo app with html css and javascript')).toBe('delegate')
    expect(classifyComplexity('Create a full stack dashboard application')).toBe('delegate')
    expect(classifyComplexity('Implement a complete user authentication system with JWT tokens and database storage')).toBe('delegate')
  })

  it('2: create delegation session', () => {
    sessionId = createSession('test-user', 'Build a todo app with html, css, and javascript')
    expect(sessionId).toBeTruthy()

    const session = getDelegationSession(sessionId)
    expect(session).toBeTruthy()
    expect(session!.status).toBe('active')
    expect(session!.user_request).toContain('todo app')
    expect(session!.chat_id).toBe('test-user')
  })

  it('3: delegate tasks to specialist agents', () => {
    createDelegateTask('main', 'dev/frontend', 'Create HTML structure for todo app', sessionId, 'HTML structure')
    createDelegateTask('main', 'dev/frontend', 'Create CSS styles for the todo app', sessionId, 'CSS styles')
    createDelegateTask('main', 'dev/frontend', 'Create JavaScript for the todo app', sessionId, 'JavaScript logic')

    const tasks = listSessionTasks(sessionId)
    expect(tasks.length).toBe(3)

    const titles = tasks.map(t => t.title)
    expect(titles).toContain('HTML structure')
    expect(titles).toContain('CSS styles')
    expect(titles).toContain('JavaScript logic')

    for (const t of tasks) {
      expect(t.status).toBe('pending')
      expect(t.from_agent).toBe('main')
      expect(t.session_id).toBe(sessionId)
    }
  })

  it('4: task worker picks up and completes all 3 tasks', async () => {
    startTaskWorker()

    let allDone = false
    const deadline = Date.now() + 20000
    while (!allDone && Date.now() < deadline) {
      await sleep(300)
      const tasks = listSessionTasks(sessionId)
      allDone = tasks.length === 3 && tasks.every(t => t.status === 'completed')
    }
    expect(allDone).toBe(true)

    const tasks = listSessionTasks(sessionId)
    for (const t of tasks) {
      expect(t.result).toBeTruthy()
      expect(String(t.result)).toContain('Mock result')
      expect(t.status).toBe('completed')
    }
  })

  it('5: session finalizes with all tasks completed', () => {
    updateSessionStatus(sessionId, 'completed')
    const session = getDelegationSession(sessionId)
    expect(session!.status).toBe('completed')

    const tasks = listSessionTasks(sessionId)
    expect(tasks.every(t => t.status === 'completed')).toBe(true)
  })

  it('6: direct response bypasses delegation tools', async () => {
    const { respondDirect } = await import('./master-orchestrator.js')
    const result = await respondDirect({
      messages: [{ role: 'user' as const, content: 'Hello there!' }],
      chatId: 'test',
    })
    expect(result.text).toBeTruthy()
    expect(result.text).toContain('Mock result')
  })
})
