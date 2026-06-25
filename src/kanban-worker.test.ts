import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createBoard, createTask, getTask,
  claimTask, setAgentBusy, registerAgent,
  completeTask, failTask,
} from './kanban-db.js'
import { startKanbanWorker, stopKanbanWorker } from './kanban-worker.js'
import { chatEvents } from './state.js'

vi.mock('./opencode-agent.js', () => {
  const mockFn = vi.fn()
  return { queryAgent: mockFn }
})

import { queryAgent } from './opencode-agent.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForTaskStatus(taskId: string, expectedStatus: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const task = getTask(taskId)
    if (task && task.status === expectedStatus) return
    await sleep(50)
  }
  const task = getTask(taskId)
  throw new Error(`waitForTaskStatus timeout: task ${taskId} expected ${expectedStatus}, got ${task?.status ?? 'not found'} after ${timeoutMs}ms`)
}

describe('kanban-worker', () => {
  let dbDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-kanban-worker-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
  })

  afterAll(async () => {
    await stopKanbanWorker()
    rmSync(dbDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    const db = getDb()
    db.exec('DELETE FROM kanban_tasks')
    db.exec('DELETE FROM kanban_boards')
    db.exec('DELETE FROM agent_sessions')
    vi.clearAllMocks()
  })

  function setupRunningTask(assignee = 'dev'): { boardId: string; taskId: string } {
    const boardId = createBoard({ title: 'WBoard', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'WorkerTask', prompt: 'execute this', status: 'ready' })
    registerAgent(assignee)
    claimTask(taskId, assignee)
    setAgentBusy(assignee, taskId)
    return { boardId, taskId }
  }

  it('picks up running tasks and executes via queryAgent', async () => {
    vi.mocked(queryAgent).mockResolvedValue({ text: 'Task completed successfully' })
    const { taskId } = setupRunningTask()

    startKanbanWorker()
    await waitForTaskStatus(taskId, 'completed')
    await stopKanbanWorker()

    expect(queryAgent).toHaveBeenCalledTimes(1)
    expect(queryAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: 'execute this' })],
        maxTurns: 10,
      })
    )
    const task = getTask(taskId)
    expect(task!.result).toBe('Task completed successfully')
  })

  it('handles task failure with retry', async () => {
    vi.mocked(queryAgent)
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce({ text: 'Second attempt succeeded' })
    const { taskId } = setupRunningTask()

    startKanbanWorker()
    await waitForTaskStatus(taskId, 'completed')
    await stopKanbanWorker()

    const task = getTask(taskId)
    expect(task!.result).toBe('Second attempt succeeded')
  })

  it('gives up after exhausting retries', async () => {
    vi.mocked(queryAgent).mockRejectedValue(new Error('Always fails'))
    const { taskId } = setupRunningTask()

    startKanbanWorker()
    await waitForTaskStatus(taskId, 'failed')
    await stopKanbanWorker()

    const task = getTask(taskId)
    expect(task!.error).toBe('All retries exhausted')
  })

  it('skips tasks with no assignee', async () => {
    vi.mocked(queryAgent).mockResolvedValue({ text: 'done' })
    const boardId = createBoard({ title: 'NoAgent', owner: 'user1' })
    const taskId = createTask({ board_id: boardId, title: 'Unassigned', prompt: 'work', status: 'running' })

    startKanbanWorker()
    await sleep(500)
    await stopKanbanWorker()

    expect(queryAgent).not.toHaveBeenCalled()
    const task = getTask(taskId)
    expect(task!.status).toBe('running')
  })

  it('emits chatEvents on completion', async () => {
    vi.mocked(queryAgent).mockResolvedValue({ text: 'done' })
    const { taskId } = setupRunningTask()
    const emitSpy = vi.spyOn(chatEvents, 'emit')

    startKanbanWorker()
    await waitForTaskStatus(taskId, 'completed')
    await stopKanbanWorker()

    expect(emitSpy).toHaveBeenCalledWith('task', expect.objectContaining({
      taskId,
      status: 'completed',
    }))
  })
})
