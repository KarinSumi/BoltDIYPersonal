import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  insertHiveEntry: vi.fn(),
  createDelegationSession: vi.fn(),
  getDelegationSession: vi.fn(),
  updateDelegationSessionStatus: vi.fn(),
  updateDelegationSessionCounts: vi.fn(),
  getActiveDelegationSessions: vi.fn(() => []),
  delegateTask: vi.fn(),
  getSessionTasks: vi.fn(() => []),
  getPendingTasks: vi.fn(() => []),
  claimTask: vi.fn(),
  completeTask: vi.fn(),
}))

vi.mock('./db.js', () => mockDb)

const mockKanban = vi.hoisted(() => ({
  createBoard: vi.fn(() => 'board-id'),
  getBoard: vi.fn(),
  listBoards: vi.fn(() => []),
  archiveBoard: vi.fn(),
  createTask: vi.fn(() => 'task-id'),
  getTask: vi.fn(),
  listTasks: vi.fn(() => []),
  updateTask: vi.fn(),
  cancelTask: vi.fn(),
}))

vi.mock('./kanban-db.js', () => mockKanban)

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

vi.mock('./config.js', () => ({
  PROJECT_ROOT: '/test/root',
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

vi.mock('js-yaml', () => ({
  load: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKanban.listBoards.mockReturnValue([])
  })

  describe('registerAgent', () => {
    it('registers a single agent successfully', async () => {
      const { registerAgent, listAgents } = await import('./orchestrator.js')
      registerAgent({ id: 'test', name: 'Test', model: 'gpt-4', personality: 'Helpful', cwd: '.', mcpServers: [] })
      const agents = listAgents()
      expect(agents.some(a => a.id === 'test')).toBe(true)
    })

    it('throws for invalid agent ID format', async () => {
      const { registerAgent } = await import('./orchestrator.js')
      expect(() => registerAgent({ id: 'INVALID', name: 'Test', model: 'gpt-4', personality: 'Helpful', cwd: '.', mcpServers: [] })).toThrow('Invalid agent ID format')
    })
  })

  describe('isDelegationRequest', () => {
    it('detects @mention delegation', async () => {
      const { isDelegationRequest } = await import('./orchestrator.js')
      const result = isDelegationRequest('@dev: write tests')
      expect(result).toEqual({ agentId: 'dev', prompt: 'write tests' })
    })

    it('detects /delegate command', async () => {
      const { isDelegationRequest } = await import('./orchestrator.js')
      const result = isDelegationRequest('/delegate dev write tests')
      expect(result).toEqual({ agentId: 'dev', prompt: 'write tests' })
    })

    it('returns null for plain text', async () => {
      const { isDelegationRequest } = await import('./orchestrator.js')
      expect(isDelegationRequest('hello world')).toBeNull()
    })
  })

  describe('activateAgent / deactivateAgent', () => {
    it('returns false for non-existent agent', async () => {
      const { activateAgent, deactivateAgent } = await import('./orchestrator.js')
      expect(activateAgent('nonexistent')).toBe(false)
      expect(deactivateAgent('nonexistent')).toBe(false)
    })

    it('activates and deactivates an agent', async () => {
      const { registerAgent, activateAgent, deactivateAgent } = await import('./orchestrator.js')
      registerAgent({ id: 'dev', name: 'Dev', model: 'gpt-4', personality: 'Helper', cwd: '.', mcpServers: [] })
      expect(activateAgent('dev')).toBe(true)
      expect(deactivateAgent('dev')).toBe(true)
    })
  })

  describe('buildAgentCatalog', () => {
    it('returns catalog with capabilities from registered agents', async () => {
      const { registerAgent, buildAgentCatalog } = await import('./orchestrator.js')
      registerAgent({ id: 'dev', name: 'Developer', model: 'gpt-4', personality: 'Code helper', cwd: '.', mcpServers: [], capabilities: ['coding'] })
      const catalog = buildAgentCatalog()
      expect(catalog.length).toBeGreaterThanOrEqual(1)
      expect(catalog[0]).toHaveProperty('id')
      expect(catalog[0]).toHaveProperty('name')
      expect(catalog[0]).toHaveProperty('capabilities')
    })
  })

  describe('deleteAgent', () => {
    it('deletes a registered agent', async () => {
      const { registerAgent, deleteAgent, listAgents } = await import('./orchestrator.js')
      registerAgent({ id: 'del-me', name: 'Delete Me', model: 'gpt-4', personality: 'Goner', cwd: '.', mcpServers: [] })
      expect(deleteAgent('del-me')).toBe(true)
      expect(listAgents().some(a => a.id === 'del-me')).toBe(false)
    })
  })

  describe('getAgent', () => {
    it('returns undefined for unknown agent', async () => {
      const { getAgent } = await import('./orchestrator.js')
      expect(getAgent('nonexistent')).toBeUndefined()
    })
  })

  describe('createSession / delegation helpers', () => {
    it('creates a delegation session', async () => {
      const { createSession } = await import('./orchestrator.js')
      const id = createSession('chat-1', 'Help me build a website')
      expect(id).toBe('test-uuid')
      expect(mockDb.createDelegationSession).toHaveBeenCalledWith({ id: 'test-uuid', chat_id: 'chat-1', user_request: 'Help me build a website' })
    })

    it('delegates a task', async () => {
      const { createDelegateTask } = await import('./orchestrator.js')
      const id = createDelegateTask('main', 'dev', 'do something', 'session-1')
      expect(id).toBe('test-uuid')
      expect(mockDb.delegateTask).toHaveBeenCalled()
    })
  })

  describe('kanban helpers', () => {
    it('createKanbanBoard delegates to kanban-db', async () => {
      const { createKanbanBoard } = await import('./orchestrator.js')
      const id = createKanbanBoard('Test Board', 'A test', 3, 'owner-1')
      expect(id).toBe('board-id')
      expect(mockKanban.createBoard).toHaveBeenCalledWith({ title: 'Test Board', description: 'A test', priority: 3, owner: 'owner-1' })
    })

    it('getBoardProgress returns 0 for missing board', async () => {
      const { getBoardProgress } = await import('./orchestrator.js')
      expect(getBoardProgress('nonexistent')).toBe(0)
    })
  })
})
