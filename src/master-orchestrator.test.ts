import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { classifyComplexity, executeOrchestratorTool, VALID_TASK_STATUSES } from './master-orchestrator.js'
import { initDatabase, getDb } from './db.js'
import { createBoard, createTask } from './kanban-db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('classifyComplexity', () => {
  it('returns "direct" for greetings', () => {
    expect(classifyComplexity('hello')).toBe('direct')
    expect(classifyComplexity('hi')).toBe('direct')
    expect(classifyComplexity('hey')).toBe('direct')
    expect(classifyComplexity('good morning')).toBe('direct')
  })

  it('returns "direct" for simple Q&A', () => {
    expect(classifyComplexity('what is 2+2?')).toBe('direct')
    expect(classifyComplexity('what time is it')).toBe('direct')
    expect(classifyComplexity('what is the capital of France')).toBe('direct')
  })

  it('returns "direct" for thanks and farewells', () => {
    expect(classifyComplexity('thanks')).toBe('direct')
    expect(classifyComplexity('thank you')).toBe('direct')
    expect(classifyComplexity('bye')).toBe('direct')
    expect(classifyComplexity('goodbye')).toBe('direct')
  })

  it('returns "delegate" for multi-step projects', () => {
    const result = classifyComplexity('build a website that tracks crypto prices with a React frontend and Node backend')
    expect(result).toBe('delegate')
  })

  it('returns "delegate" for cross-domain requests', () => {
    const result = classifyComplexity('research best AI models and write a report about them')
    expect(result).toBe('delegate')
  })

  it('returns "delegate" for requests mentioning multiple agents', () => {
    const result = classifyComplexity('create a dashboard with backend API and documentation')
    expect(result).toBe('delegate')
  })

  it('returns "direct" for 1-2 step instructions', () => {
    expect(classifyComplexity('read file src/index.ts')).toBe('direct')
    expect(classifyComplexity('search the web for weather')).toBe('direct')
  })

  it('returns "direct" for status checks', () => {
    expect(classifyComplexity('show me the task status')).toBe('direct')
    expect(classifyComplexity('what is the progress')).toBe('direct')
  })

  it('returns "delegate" for research + write combos', () => {
    expect(classifyComplexity('research the market and write a summary')).toBe('delegate')
  })
})

describe('executeOrchestratorTool', () => {
  let dbDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-master-orch-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    const db = getDb()
    db.exec('DELETE FROM kanban_tasks')
    db.exec('DELETE FROM kanban_boards')
    db.exec('DELETE FROM agent_sessions')
  })

  it('rejects invalid task status in set_task_status', async () => {
    const boardId = createBoard({ title: 'Test', owner: 'user' })
    const taskId = createTask({ board_id: boardId, title: 'T', prompt: 'test', status: 'triage' })
    const result = await executeOrchestratorTool({
      name: 'set_task_status',
      arguments: JSON.stringify({ task_id: taskId, status: 'comleted' }),
    })
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('Invalid status')
    expect(parsed.error).toContain('comleted')
  })

  it('accepts valid task statuses', async () => {
    const boardId = createBoard({ title: 'Test', owner: 'user' })
    const taskId = createTask({ board_id: boardId, title: 'T', prompt: 'test', status: 'triage' })
    for (const status of [...VALID_TASK_STATUSES]) {
      const result = await executeOrchestratorTool({
        name: 'set_task_status',
        arguments: JSON.stringify({ task_id: taskId, status }),
      })
      const parsed = JSON.parse(result)
      expect(parsed.error).toBeUndefined()
    }
  })

  it('returns error for missing board in get_board_status', async () => {
    const result = await executeOrchestratorTool({
      name: 'get_board_status',
      arguments: JSON.stringify({ board_id: 'nonexistent-board-id' }),
    })
    const parsed = JSON.parse(result)
    expect(parsed.error).toBe('Board not found')
  })
})

