import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  TELEGRAM_BOT_TOKEN: 'test-token',
  ALLOWED_CHAT_ID: '',
  MAX_MESSAGE_LENGTH: 4096,
  SECURITY_PIN_HASH: '',
  AGENT_TIMEOUT_MS: 900000,
  TYPING_REFRESH_MS: 4000,
}))

vi.mock('./config.js', () => mockConfig)

vi.mock('./opencode-agent.js', () => ({
  AgentMessage: class {},
}))

vi.mock('./db.js', () => ({
  clearSession: vi.fn(),
  insertTurn: vi.fn(),
  getRecentTurns: vi.fn(() => []),
  insertScheduledTask: vi.fn(),
  insertMission: vi.fn(),
  listScheduledTasks: vi.fn(() => []),
  listMissions: vi.fn(() => []),
}))

vi.mock('./message-queue.js', () => ({
  enqueue: vi.fn((_chatId: string, fn: () => Promise<void>) => fn()),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('./state.js', () => ({
  voiceEnabledChats: new Set<string>(),
  chatEvents: { on: vi.fn(), emit: vi.fn() },
  abortControllers: new Map<string, AbortController>(),
  touchActivity: vi.fn(),
}))

vi.mock('./orchestrator.js', () => ({
  listAgents: vi.fn(() => []),
  listKanbanBoards: vi.fn(() => []),
  listKanbanTasks: vi.fn(() => []),
  getKanbanBoard: vi.fn(),
  getKanbanTask: vi.fn(),
  isDelegationRequest: vi.fn(),
  getAgent: vi.fn(),
  createKanbanBoard: vi.fn(() => 'board-id'),
  createKanbanTask: vi.fn(() => 'task-id'),
  setKanbanTaskStatus: vi.fn(),
}))

vi.mock('./master-orchestrator.js', () => ({
  classifyComplexity: vi.fn(() => 'direct'),
  runOrchestrator: vi.fn(),
  respondDirect: vi.fn(() => Promise.resolve({ text: 'direct response' })),
}))

vi.mock('./security.js', () => ({
  isLocked: vi.fn(() => false),
  lock: vi.fn(),
  unlock: vi.fn(() => false),
  checkKillPhrase: vi.fn(() => false),
  resetIdleTimer: vi.fn(),
}))

vi.mock('./errors.js', () => ({
  classifyError: vi.fn(() => ({ category: 'unknown', recovery: {} })),
}))

vi.mock('./obsidian-sync.js', () => ({
  syncAllBoardsToFiles: vi.fn(() => 0),
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

const mockBot = vi.hoisted(() => ({
  use: vi.fn(),
  command: vi.fn(),
  on: vi.fn(),
  start: vi.fn(),
}))

vi.mock('grammy', () => ({
  Bot: vi.fn(() => mockBot),
  Context: class {},
}))

describe('bot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.TELEGRAM_BOT_TOKEN = 'test-token'
    mockConfig.ALLOWED_CHAT_ID = ''
    mockConfig.SECURITY_PIN_HASH = ''
  })

  describe('createBot', () => {
    it('throws when TELEGRAM_BOT_TOKEN is not set', async () => {
      mockConfig.TELEGRAM_BOT_TOKEN = ''
      const { createBot } = await import('./bot.js')
      expect(() => createBot()).toThrow('TELEGRAM_BOT_TOKEN is required')
    })

    it('creates a bot instance when token is set', async () => {
      const { createBot } = await import('./bot.js')
      const bot = createBot()
      expect(bot).toBeTruthy()
    })

    it('sets up command handlers', async () => {
      const { createBot } = await import('./bot.js')
      createBot()
      expect(mockBot.command).toHaveBeenCalledWith('start', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('help', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('chatid', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('newchat', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('agents', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('pin', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('setpin', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('task', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('mission', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('status', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('lock', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('kanban', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('board', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('taskinfo', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('voice', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('obssync', expect.any(Function))
      expect(mockBot.command).toHaveBeenCalledWith('obswatch', expect.any(Function))
    })

    it('sets up message handlers', async () => {
      const { createBot } = await import('./bot.js')
      createBot()
      expect(mockBot.on).toHaveBeenCalledWith('message:text', expect.any(Function))
      expect(mockBot.on).toHaveBeenCalledWith('message:photo', expect.any(Function))
      expect(mockBot.on).toHaveBeenCalledWith('message:document', expect.any(Function))
      expect(mockBot.on).toHaveBeenCalledWith('message:voice', expect.any(Function))
      expect(mockBot.on).toHaveBeenCalledWith('message:video', expect.any(Function))
    })

    it('sets up middleware', async () => {
      const { createBot } = await import('./bot.js')
      createBot()
      expect(mockBot.use).toHaveBeenCalledWith(expect.any(Function))
    })

    it('handles chat event errors', async () => {
      const { chatEvents } = await import('./state.js')
      const { createBot } = await import('./bot.js')
      createBot()
      expect(chatEvents.on).toHaveBeenCalledWith('error', expect.any(Function))
    })
  })
})
