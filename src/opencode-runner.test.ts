import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./opencode-server.js', () => ({
  getOpenCodeBaseURL: () => 'http://127.0.0.1:4096',
  isOpenCodeServerReady: vi.fn(() => false),
}))

vi.mock('./config.js', () => ({
  TASK_TIMEOUT_OPENCODE_MS: 900000,
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('opencode-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('promptOpenCode', () => {
    it('throws when server is not ready', async () => {
      const { promptOpenCode } = await import('./opencode-runner.js')
      await expect(promptOpenCode({ chatId: 'chat-1', prompt: 'hello' })).rejects.toThrow('OpenCode server is not available')
    })
  })

  describe('clearOpenCodeSession', () => {
    it('does not throw when no session exists', async () => {
      const { clearOpenCodeSession } = await import('./opencode-runner.js')
      expect(() => clearOpenCodeSession('nonexistent')).not.toThrow()
    })
  })

  describe('listOpenCodeSessions', () => {
    it('returns empty map initially', async () => {
      const { listOpenCodeSessions } = await import('./opencode-runner.js')
      expect(listOpenCodeSessions().size).toBe(0)
    })
  })
})
