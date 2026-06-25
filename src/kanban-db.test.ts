import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createBoard, getBoard, listBoards, listAllBoards, updateBoard, archiveBoard,
  pauseBoard, resumeBoard,
  createTask, getTask, listTasks, updateTask,
  completeTask, failTask, blockTask, unblockTask, cancelTask, claimTask,
  getTasksByStatus, getDependentTasks, advanceDependencies,
  updateBoardProgress,
  registerAgent, setAgentBusy, setAgentIdle, getIdleAgents,
  incrementAgentFailures, resetAgentFailures, getOfflineAgents,
  getAllAgentSessions, touchAgent, heartbeatAgent,
  releaseStaleClaims,
} from './kanban-db.js'

describe('kanban-db', () => {
  let dbDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-kanban-'))
    process.env.STORE_DIR = dbDir
    initDatabase(join(dbDir, 'test.sqlite'))
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  describe('boards', () => {
    it('creates and retrieves a board', () => {
      const id = createBoard({ title: 'Build Todo App', description: 'A full stack todo app', priority: 3, owner: 'user1' })
      expect(id).toBeTruthy()

      const board = getBoard(id)
      expect(board).toBeTruthy()
      expect(board!.title).toBe('Build Todo App')
      expect(board!.description).toContain('todo')
      expect(board!.priority).toBe(3)
      expect(board!.owner).toBe('user1')
      expect(board!.status).toBe('active')
      expect(board!.progress_pct).toBe(0)
    })

    it('lists boards by owner', () => {
      createBoard({ title: 'Goal A', owner: 'user1' })
      createBoard({ title: 'Goal B', owner: 'user1' })
      createBoard({ title: 'Goal C', owner: 'user2' })

      const user1Boards = listBoards('user1')
      expect(user1Boards.length).toBeGreaterThanOrEqual(2)
      expect(user1Boards.every(b => b.owner === 'user1')).toBe(true)
    })

    it('lists boards filtered by status', () => {
      createBoard({ title: 'Active Goal', owner: 'user1' })
      const pausedId = createBoard({ title: 'Paused Goal', owner: 'user1' })
      pauseBoard(pausedId)

      const active = listBoards('user1', 'active')
      expect(active.every(b => b.status === 'active')).toBe(true)
    })

    it('pauses and resumes a board', () => {
      const id = createBoard({ title: 'Pausable', owner: 'user1' })
      pauseBoard(id)
      expect(getBoard(id)!.status).toBe('paused')
      resumeBoard(id)
      expect(getBoard(id)!.status).toBe('active')
    })

    it('archives a board', () => {
      const id = createBoard({ title: 'Archivable', owner: 'user1' })
      archiveBoard(id, 'All done')
      const board = getBoard(id)
      expect(board!.status).toBe('archived')
      expect(board!.summary).toContain('All done')
    })

    it('blocks/unblocks a task', () => {
      const boardId = createBoard({ title: 'DepTest', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'Blocked Task', prompt: 'do stuff', status: 'ready' })
      blockTask(taskId, 'Waiting for dependency')
      expect(getTask(taskId)!.status).toBe('blocked')
      expect(getTask(taskId)!.error).toContain('Waiting')
      unblockTask(taskId)
      expect(getTask(taskId)!.status).toBe('ready')
    })

    it('cancels a task', () => {
      const boardId = createBoard({ title: 'CancelTest', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'Cancellable', prompt: 'do it', status: 'ready' })
      cancelTask(taskId)
      expect(getTask(taskId)!.status).toBe('cancelled')
    })
  })

  describe('tasks', () => {
    it('creates a task with defaults', () => {
      const boardId = createBoard({ title: 'TaskBoard', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'Write tests', prompt: 'Write unit tests for all modules' })
      expect(taskId).toBeTruthy()

      const task = getTask(taskId)
      expect(task).toBeTruthy()
      expect(task!.title).toBe('Write tests')
      expect(task!.board_id).toBe(boardId)
      expect(task!.status).toBe('triage')
      expect(task!.priority).toBe(3)
      expect(task!.max_retries).toBe(2)
      expect(task!.retry_count).toBe(0)
    })

    it('creates a task with assignee and priority', () => {
      const boardId = createBoard({ title: 'Assigned', owner: 'user1' })
      const taskId = createTask({
        board_id: boardId,
        title: 'Fix bug',
        prompt: 'Fix the login bug',
        assignee: 'dev/frontend',
        priority: 1,
      })
      const task = getTask(taskId)
      expect(task!.assignee).toBe('dev/frontend')
      expect(task!.priority).toBe(1)
    })

    it('lists tasks for a board', () => {
      const boardId = createBoard({ title: 'ListTest', owner: 'user1' })
      createTask({ board_id: boardId, title: 'T1', prompt: 't1' })
      createTask({ board_id: boardId, title: 'T2', prompt: 't2' })
      createTask({ board_id: boardId, title: 'T3', prompt: 't3' })

      const tasks = listTasks(boardId)
      expect(tasks.length).toBe(3)
    })

    it('updates task status and result', () => {
      const boardId = createBoard({ title: 'UpdateTest', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'Updatable', prompt: 'update me', status: 'ready' })

      updateTask(taskId, { status: 'running', assignee: 'dev' })
      expect(getTask(taskId)!.status).toBe('running')
      expect(getTask(taskId)!.assignee).toBe('dev')

      completeTask(taskId, 'Done!')
      const task = getTask(taskId)
      expect(task!.status).toBe('completed')
      expect(task!.result).toBe('Done!')
    })
  })

  describe('dispatcher queries', () => {
    it('gets tasks by status', () => {
      const boardId = createBoard({ title: 'StatusBoard', owner: 'user1' })
      createTask({ board_id: boardId, title: 'Triage', prompt: 't', status: 'triage' })
      createTask({ board_id: boardId, title: 'Ready', prompt: 'r', status: 'ready' })
      createTask({ board_id: boardId, title: 'Running', prompt: 'run', status: 'running' })

      const triage = getTasksByStatus('triage')
      expect(triage.length).toBeGreaterThanOrEqual(1)
      expect(triage.every(t => t.status === 'triage')).toBe(true)

      const running = getTasksByStatus('running')
      expect(running.length).toBeGreaterThanOrEqual(1)
      expect(running.every(t => t.status === 'running')).toBe(true)
    })

    it('gets dependent tasks for a completed task', () => {
      const boardId = createBoard({ title: 'Deps', owner: 'user1' })
      const a = createTask({ board_id: boardId, title: 'A', prompt: 'do A', status: 'ready' })
      const b = createTask({ board_id: boardId, title: 'B', prompt: 'do B', status: 'ready', depends_on: JSON.stringify([a]) })
      const c = createTask({ board_id: boardId, title: 'C', prompt: 'do C', status: 'ready', depends_on: JSON.stringify([a]) })

      completeTask(a, 'A done')
      advanceDependencies(a)

      const depTasks = getDependentTasks(a)
      expect(depTasks.length).toBe(2)
      expect(depTasks.map(t => t.id)).toContain(b)
      expect(depTasks.map(t => t.id)).toContain(c)
    })

    it('releases stale running tasks', () => {
      const boardId = createBoard({ title: 'Stale', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'StaleTask', prompt: 'stale', status: 'ready' })
      claimTask(taskId, 'dev')

      releaseStaleClaims(0)

      const stale = getTasksByStatus('ready')
      const found = stale.find(t => t.title === 'StaleTask')
      expect(found).toBeTruthy()
      expect(found!.retry_count).toBe(1)
    })
  })

  describe('agent sessions', () => {
    it('registers and tracks agents', () => {
      registerAgent('dev/frontend', ['html', 'css', 'js'])
      registerAgent('dev/backend', ['api', 'database'])

      const idle = getIdleAgents()
      expect(idle.length).toBeGreaterThanOrEqual(2)
      expect(idle.find(a => a.agent_id === 'dev/frontend')).toBeTruthy()
    })

    it('sets agent busy and idle', () => {
      const taskId = createTask({ board_id: createBoard({ title: 'AgentTest', owner: 'user1' }), title: 'AgentWork', prompt: 'work', status: 'ready' })
      setAgentBusy('dev/frontend', taskId)

      const idle = getIdleAgents()
      expect(idle.find(a => a.agent_id === 'dev/frontend')).toBeFalsy()

      setAgentIdle('dev/frontend')
      const idleAfter = getIdleAgents()
      expect(idleAfter.find(a => a.agent_id === 'dev/frontend')).toBeTruthy()
    })

    it('increments and resets failures', () => {
      registerAgent('dev/unstable')

      const count1 = incrementAgentFailures('dev/unstable')
      expect(count1).toBe(1)
      const count2 = incrementAgentFailures('dev/unstable')
      expect(count2).toBe(2)

      resetAgentFailures('dev/unstable')
      const count3 = incrementAgentFailures('dev/unstable')
      expect(count3).toBe(1)
    })

    it('detects offline agents', () => {
      registerAgent('dev/broken')
      incrementAgentFailures('dev/broken')
      incrementAgentFailures('dev/broken')
      incrementAgentFailures('dev/broken')

      const offline = getOfflineAgents()
      const found = offline.find(a => a.agent_id === 'dev/broken')
      expect(found).toBeTruthy()
    })

    it('getAllAgentSessions returns all sessions', () => {
      registerAgent('dev/alpha')
      registerAgent('dev/beta')
      const all = getAllAgentSessions()
      const ids = all.map(a => a.agent_id)
      expect(ids).toContain('dev/alpha')
      expect(ids).toContain('dev/beta')
    })

    it('touchAgent updates heartbeat and revives offline agents', () => {
      registerAgent('dev/revived')
      incrementAgentFailures('dev/revived')
      incrementAgentFailures('dev/revived')
      incrementAgentFailures('dev/revived')

      let offline = getOfflineAgents()
      expect(offline.find(a => a.agent_id === 'dev/revived')).toBeTruthy()

      touchAgent('dev/revived')
      const all = getAllAgentSessions()
      const revived = all.find(a => a.agent_id === 'dev/revived')
      expect(revived).toBeTruthy()
      expect(revived!.status).toBe('idle')
    })

    it('heartbeatAgent updates last_heartbeat', () => {
      registerAgent('dev/beat')
      heartbeatAgent('dev/beat')
      const all = getAllAgentSessions()
      const agent = all.find(a => a.agent_id === 'dev/beat')
      expect(agent).toBeTruthy()
      expect(agent!.last_heartbeat).toBeTruthy()
    })
  })

  describe('board progress', () => {
    it('calculates progress percentage', () => {
      const boardId = createBoard({ title: 'Progress', owner: 'user1' })
      createTask({ board_id: boardId, title: 'T1', prompt: 't1', status: 'completed' })
      createTask({ board_id: boardId, title: 'T2', prompt: 't2', status: 'completed' })
      createTask({ board_id: boardId, title: 'T3', prompt: 't3', status: 'running' })
      createTask({ board_id: boardId, title: 'T4', prompt: 't4', status: 'ready' })

      updateBoardProgress(boardId)
      const board = getBoard(boardId)
      expect(board!.task_count).toBe(4)
      expect(board!.completed_count).toBe(2)
      expect(board!.progress_pct).toBe(50)
    })
  })

  describe('listAllBoards', () => {
    it('returns all boards regardless of owner', () => {
      const b1 = createBoard({ title: 'B1', owner: 'user1' })
      const b2 = createBoard({ title: 'B2', owner: 'user2' })
      const all = listAllBoards()
      const ids = all.map(b => b.id)
      expect(ids).toContain(b1)
      expect(ids).toContain(b2)
    })

    it('filters by status', () => {
      const b3 = createBoard({ title: 'B3', owner: 'user1' })
      archiveBoard(b3)
      const active = listAllBoards('active')
      expect(active.find(b => b.id === b3)).toBeFalsy()
      const archived = listAllBoards('archived')
      expect(archived.find(b => b.id === b3)).toBeTruthy()
    })
  })
})
