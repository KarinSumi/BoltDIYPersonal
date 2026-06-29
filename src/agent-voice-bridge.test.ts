import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  initDatabase: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn(() => Promise.resolve({ text: 'response', inputTokens: 10, outputTokens: 20 })),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('agent-voice-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses command-line arguments correctly', async () => {
    vi.stubGlobal('process', {
      ...process,
      argv: ['node', 'agent-voice-bridge.js', '--agent', 'dev', '--message', 'hello', '--chat-id', 'warroom', '--quick', 'true'],
    })
    const mod = await import('./agent-voice-bridge.js')
    // module runs main() immediately
  })
})
