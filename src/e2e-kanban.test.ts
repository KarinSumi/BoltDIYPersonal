import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { registerMainAgent, createKanbanBoard, getKanbanBoard, createKanbanTask, getKanbanTask, listKanbanTasks } from './orchestrator.js'
import { tick, startDispatcher, stopDispatcher } from './dispatcher.js'
import { registerAgent, claimTask, setAgentBusy, setAgentOffline, getIdleAgents, completeTask, getTasksByStatus, getOfflineAgents, incrementAgentFailures, failTask } from './kanban-db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn().mockResolvedValue({ text: 'Mock result for delegated task' }),
}))

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('e2e: full kanban pipeline', () => {
  let dbDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-e2e-kanban-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
    registerMainAgent()
  })

  afterAll(() => {
    stopDispatcher()
    rmSync(dbDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    const db = getDb()
    db.exec('DELETE FROM kanban_tasks')
    db.exec('DELETE FROM kanban_boards')
    db.exec('DELETE FROM agent_sessions')
  })

  it('1: creates a kanban board with tasks', () => {
    const boardId = createKanbanBoard('Build a todo app', 'HTML/CSS/JS', 3, 'test-user')
    expect(boardId).toBeTruthy()

    const board = getKanbanBoard(boardId)
    expect(board).toBeTruthy()
    expect(board!.title).toBe('Build a todo app')
    expect(board!.status).toBe('active')
    expect(board!.progress_pct).toBe(0)

    const taskId = createKanbanTask(boardId, 'Build HTML', 'Create the HTML structure', 'dev/frontend', 1)
    expect(taskId).toBeTruthy()

    const task = getKanbanTask(taskId)
    expect(task).toBeTruthy()
    expect(task!.title).toBe('Build HTML')
    expect(task!.priority).toBe(1)
    expect(task!.board_id).toBe(boardId)
  })

  it('2: promotes triage tasks and assigns to idle agents', async () => {
    const boardId = createKanbanBoard('Fix bugs', 'Bug fixes', 2, 'test-user')
    const taskId = createKanbanTask(boardId, 'Fix login bug', 'Debug the login issue')

    // Task starts as triage; agent is needed for assignment
    const task = getKanbanTask(taskId)
    expect(task!.status).toBe('triage')

    registerAgent('dev/frontend')

    // Tick: promotes triage → ready, then assigns ready → running
    const stats = await tick()
    expect(stats.promoted).toBe(1)
    expect(stats.assigned).toBe(1)

    const after = getKanbanTask(taskId)
    expect(after!.status).toBe('running')
    expect(after!.assignee).toBe('dev/frontend')
  })

  it('3: dispatcher requeues failed tasks', async () => {
    const boardId = createKanbanBoard('Test retry', '', 3, 'test-user')
    const taskId = createKanbanTask(boardId, 'Flaky task', 'Might fail', undefined, 1)

    // Promote to ready, then assign to agent
    registerAgent('dev/backend')
    await tick()
    expect(getKanbanTask(taskId)!.status).toBe('running')

    // Manually fail the task
    failTask(taskId, 'Connection timeout')
    expect(getKanbanTask(taskId)!.status).toBe('failed')

    // Tick should requeue it
    const stats = await tick()
    expect(stats.failed).toBe(1)
    expect(getKanbanTask(taskId)!.status).toBe('ready')
    expect(getKanbanTask(taskId)!.retry_count).toBe(1)
  })

  it('4: circuit breaker — 3 failures puts agent offline', async () => {
    registerAgent('dev/unstable')

    incrementAgentFailures('dev/unstable')
    incrementAgentFailures('dev/unstable')
    incrementAgentFailures('dev/unstable')

    const offline = getOfflineAgents()
    expect(offline.find(a => a.agent_id === 'dev/unstable')).toBeTruthy()

    // Tick should recover offline agents
    const stats = await tick()
    expect(stats.recovered).toBe(1)

    const idle = getIdleAgents()
    expect(idle.find(a => a.agent_id === 'dev/unstable')).toBeTruthy()
  })

  it('5: board progress updates after task completion', async () => {
    const boardId = createKanbanBoard('Progress check', '', 1, 'test-user')

    const t1 = createKanbanTask(boardId, 'Task 1', 'Do thing 1')
    const t2 = createKanbanTask(boardId, 'Task 2', 'Do thing 2')
    createKanbanTask(boardId, 'Task 3', 'Do thing 3')

    // Manually complete 2 tasks
    completeTask(t1, 'Done 1')
    completeTask(t2, 'Done 2')

    // Tick updates progress
    await tick()
    const board = getKanbanBoard(boardId)
    expect(board!.task_count).toBe(3)
    expect(board!.completed_count).toBe(2)
    expect(board!.progress_pct).toBe(67)
  })
})
