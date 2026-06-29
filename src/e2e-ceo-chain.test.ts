import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./llm-client.js', () => ({
  getClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({
          choices: [{
            finish_reason: 'stop',
            message: { content: 'Hello! How can I help you?', role: 'assistant' },
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        })),
      },
    },
  })),
  getModel: vi.fn(() => 'test-model'),
}))

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn(),
  retryOnRateLimit: vi.fn((model, fn) => fn(model)),
  availableTools: [],
  executeToolCall: vi.fn(),
  AgentMessage: class {},
  AgentResult: class {},
}))

vi.mock('./orchestrator.js', () => ({
  listAgents: vi.fn(() => [
    { id: 'dev', name: 'Developer', capabilities: ['code'], personality: 'developer' },
    { id: 'research', name: 'Researcher', capabilities: ['research'], personality: 'researcher' },
  ]),
  createKanbanBoard: vi.fn(() => 'board-e2e-123'),
  createKanbanTask: vi.fn(() => 'task-e2e-123'),
  getKanbanBoard: vi.fn(() => ({ id: 'board-e2e-123', title: 'Test', status: 'active' })),
  listKanbanBoards: vi.fn(() => []),
  listKanbanTasks: vi.fn(() => []),
  getKanbanTask: vi.fn(() => null),
  setKanbanTaskStatus: vi.fn(),
  cancelKanbanTask: vi.fn(),
  getBoardProgress: vi.fn(() => 50),
  archiveKanbanBoard: vi.fn(),
}))

vi.mock('./memory.js', () => ({
  getMemoryContext: vi.fn(() => ''),
  addGoodMemory: vi.fn(),
  addBadMemory: vi.fn(),
}))

vi.mock('./context-compressor.js', () => ({
  compressContext: vi.fn((messages) => messages),
}))

vi.mock('./config.js', () => ({
  AGENT_MAX_TURNS: 10,
  STORE_DIR: '/tmp/test-store',
  OPENCODE_MODEL: 'test-model',
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('CEO Chain E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleCeoOrder creates board and returns plan', async () => {
    const { handleCeoOrder } = await import('./ceo-chain.js')
    const { queryAgent } = await import('./opencode-agent.js')

    vi.mocked(queryAgent).mockResolvedValue({
      text: JSON.stringify([
        { title: 'Research requirements', agentId: 'research', prompt: 'Find out what users need' },
        { title: 'Build prototype', agentId: 'dev', prompt: 'Build a working prototype' },
      ]),
    } as any)

    const result = await handleCeoOrder('Build a new dashboard for the office', 'user-ceo-123')

    expect(result.boardId).toBeTruthy()
    expect(result.plan).toContain('Research requirements')
    expect(result.plan).toContain('Build prototype')
    expect(result.summary).toContain('Decomposed')
  })

  it('runOrchestrator handles CEO-level order', async () => {
    const { runOrchestrator } = await import('./master-orchestrator.js')
    const { queryAgent } = await import('./opencode-agent.js')

    vi.mocked(queryAgent).mockResolvedValue({
      text: JSON.stringify([
        { title: 'Research', agentId: 'research', prompt: 'Research the topic' },
      ]),
    } as any)

    const result = await runOrchestrator({
      messages: [{ role: 'user', content: 'CEO: Build a new authentication system' }],
      chatId: 'user-test',
    })

    expect(result.text).toBeTruthy()
    expect(result.text).toContain('CEO Chain of Command')
  })

  it('runOrchestrator handles simple requests without CEO chain', async () => {
    const { runOrchestrator } = await import('./master-orchestrator.js')

    const result = await runOrchestrator({
      messages: [{ role: 'user', content: 'What time is it?' }],
      chatId: 'user-test',
    })

    expect(result.text).toBeTruthy()
  })
})
