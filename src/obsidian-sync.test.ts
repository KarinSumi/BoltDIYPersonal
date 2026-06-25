import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, getDb } from './db.js'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createBoard, createTask, getTask, updateTask } from './kanban-db.js'
import { v4 as uuid } from 'uuid'

import { boardToMarkdown, markdownToBoardDeltas, syncBoardToFile, syncFileToBoard } from './obsidian-sync.js'

describe('obsidian-sync', () => {
  let dbDir: string
  let vaultDir: string

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'opencode-obsidian-'))
    vaultDir = join(dbDir, 'vault', 'kanban')
    mkdirSync(vaultDir, { recursive: true })
    process.env.STORE_DIR = dbDir
    process.env.OBSIDIAN_VAULT_PATH = join(dbDir, 'vault')
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

  describe('boardToMarkdown', () => {
    it('renders a board with tasks as markdown', async () => {
      const boardId = createBoard({ title: 'Test Board', owner: 'user1', description: 'A test board' })
      const t1 = createTask({ board_id: boardId, title: 'Task One', prompt: 'do it', status: 'completed' })
      const t2 = createTask({ board_id: boardId, title: 'Task Two', prompt: 'do that', status: 'running' })
      const t3 = createTask({ board_id: boardId, title: 'Task Three', prompt: 'maybe', status: 'triage' })
      updateTask(t1, { result: 'done' })

      const md = boardToMarkdown(boardId)
      expect(md).toContain('# Test Board')
      expect(md).toContain('description: A test board')
      expect(md).toContain('status: active')
      expect(md).toContain('[x] Task One')
      expect(md).toContain('[/] Task Two')
      expect(md).toContain('[ ] Task Three')
      expect(md).toContain('task_id::')
    })
  })

  describe('markdownToBoardDeltas', () => {
    it('parses task status changes from markdown', () => {
      const md = `# Test Board
> status: active | progress: 50%

- [x] Task One (task_id:: task-1)
- [ ] Task Two (task_id:: task-2)
- [-] Task Three (task_id:: task-3)`

      const deltas = markdownToBoardDeltas(md)
      expect(deltas).toHaveLength(3)
      expect(deltas[0]).toEqual({ taskId: 'task-1', status: 'completed' })
      expect(deltas[1]).toEqual({ taskId: 'task-2', status: 'triage' })
      expect(deltas[2]).toEqual({ taskId: 'task-3', status: 'failed' })
    })

    it('returns empty array when no task markers found', () => {
      const md = '# No tasks here\nJust some text'
      expect(markdownToBoardDeltas(md)).toEqual([])
    })
  })

  describe('syncBoardToFile', () => {
    it('writes board markdown to vault', () => {
      const boardId = createBoard({ title: 'Sync Test', owner: 'user1' })
      createTask({ board_id: boardId, title: 'A task', prompt: 'go', status: 'ready' })

      const filePath = syncBoardToFile(boardId)
      expect(filePath).not.toBeNull()
      expect(filePath!).toContain(boardId)
      expect(existsSync(filePath!)).toBe(true)
      const content = readFileSync(filePath!, 'utf-8')
      expect(content).toContain('# Sync Test')
      expect(content).toContain('[>] A task')
    })
  })

  describe('syncFileToBoard', () => {
    it('updates task statuses from markdown file', () => {
      const boardId = createBoard({ title: 'File Sync', owner: 'user1' })
      const taskId = createTask({ board_id: boardId, title: 'Task', prompt: 'go', status: 'running' })

      const filePath = join(vaultDir, `${boardId}.md`)
      const md = `# File Sync
> status: active

- [x] Task (task_id:: ${taskId})`
      writeFileSync(filePath, md, 'utf-8')

      syncFileToBoard(filePath)
      const task = getTask(taskId)
      expect(task!.status).toBe('completed')
    })

    it('ignores files without kanban board id in name', () => {
      const filePath = join(vaultDir, 'random.md')
      writeFileSync(filePath, '# Random', 'utf-8')
      expect(() => syncFileToBoard(filePath)).not.toThrow()
    })
  })

  describe('round-trip', () => {
    it('board → markdown → board produces same data', () => {
      const boardId = createBoard({ title: 'Round Trip', owner: 'user1' })
      const t1 = createTask({ board_id: boardId, title: 'Task A', prompt: 'do a', status: 'completed' })
      const t2 = createTask({ board_id: boardId, title: 'Task B', prompt: 'do b', status: 'triage' })

      const md = boardToMarkdown(boardId)
      const deltas = markdownToBoardDeltas(md)

      expect(deltas.find(d => d.taskId === t1)?.status).toBe('completed')
      expect(deltas.find(d => d.taskId === t2)?.status).toBe('triage')
    })
  })
})
