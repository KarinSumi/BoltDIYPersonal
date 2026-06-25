import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createBoard, createTask, getTask, getTasksByStatus,
  claimTask, completeTask, failTask, updateTask,
  registerAgent, setAgentBusy, setAgentIdle, getIdleAgents,
  incrementAgentFailures, getOfflineAgents, setAgentOffline,
  releaseStaleClaims,
  updateBoardProgress, getBoard,
} from './kanban-db.js'
import { tick, startDispatcher, stopDispatcher } from './dispatcher.js'

describe('dispatcher', () => {
  let dbDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-dispatch-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
  })

  afterAll(() => {
    stopDispatcher()
    rmSync(dbDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    // Clear relevant tables
    const db = getDb()
    db.exec('DELETE FROM kanban_tasks')
    db.exec('DELETE FROM kanban_boards')
    db.exec('DELETE FROM agent_sessions')
  })

  it('releases stale running tasks', async () => {
    const boardId = createBoard({ title: 'StaleBoard', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'StaleTask', prompt: 'stale', status: 'ready' })
    claimTask(taskId, 'dev')
    registerAgent('dev')
    setAgentBusy('dev', taskId)

    // Simulate task has been running for 6+ minutes
    updateTask(taskId, { started_at: new Date(Date.now() - 310_000).toISOString() })

    const stats = await tick()

    expect(stats.freed).toBe(1)
    const task = getTask(taskId)
    expect(task!.status).toBe('ready')
    expect(task!.retry_count).toBe(1)
  })

  it('promotes triage tasks to ready', async () => {
    const boardId = createBoard({ title: 'TriageBoard', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'TriageTask', prompt: 'needs review', status: 'triage' })

    const stats = await tick()

    expect(stats.promoted).toBe(1)
    const task = getTask(taskId)
    expect(task!.status).toBe('ready')
  })

  it('assigns ready task to idle agent', async () => {
    const boardId = createBoard({ title: 'AssignBoard', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'ReadyTask', prompt: 'do it', status: 'ready' })
    registerAgent('dev/frontend')

    const stats = await tick()

    expect(stats.assigned).toBe(1)
    const task = getTask(taskId)
    expect(task!.status).toBe('running')
    expect(task!.assignee).toBe('dev/frontend')
    const idle = getIdleAgents()
    expect(idle.find(a => a.agent_id === 'dev/frontend')).toBeFalsy()
  })

  it('requeues failed tasks with remaining retries', async () => {
    const boardId = createBoard({ title: 'FailBoard', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'FailTask', prompt: 'might fail', status: 'failed', max_retries: 3 })
    failTask(taskId, 'Something went wrong')

    const stats = await tick()

    expect(stats.failed).toBe(1)
    const task = getTask(taskId)
    expect(task!.status).toBe('ready')
    expect(task!.retry_count).toBe(1)
  })

  it('recovers offline agents after idle timeout', async () => {
    registerAgent('dev/backend')
    setAgentOffline('dev/backend')
    incrementAgentFailures('dev/backend')
    incrementAgentFailures('dev/backend')
    incrementAgentFailures('dev/backend')

    const stats = await tick()

    expect(stats.recovered).toBe(1)
    const idle = getIdleAgents()
    expect(idle.find(a => a.agent_id === 'dev/backend')).toBeTruthy()
  })

  it('updates board progress after changes', async () => {
    const boardId = createBoard({ title: 'ProgressBoard', owner: 'user1' })
    createTask({ board_id: boardId, title: 'T1', prompt: 't1', status: 'completed' })
    createTask({ board_id: boardId, title: 'T2', prompt: 't2', status: 'completed' })
    createTask({ board_id: boardId, title: 'T3', prompt: 't3', status: 'running' })

    const stats = await tick()

    const board = getBoard(boardId)
    expect(board!.task_count).toBe(3)
    expect(board!.completed_count).toBe(2)
    expect(board!.progress_pct).toBe(67)
    expect(stats.boardsUpdated).toBeGreaterThanOrEqual(1)
  })
})
