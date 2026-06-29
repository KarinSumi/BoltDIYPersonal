import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  OPENCODE_SERVER_PORT: 4096,
  OPENCODE_SERVER_ENABLED: true,
}))

vi.mock('./config.js', () => mockConfig)

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
  execSync: vi.fn(),
}))

describe('opencode-server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.OPENCODE_SERVER_ENABLED = true
    mockConfig.OPENCODE_SERVER_PORT = 4096
  })

  describe('getOpenCodeBaseURL', () => {
    it('returns correct URL', async () => {
      const { getOpenCodeBaseURL } = await import('./opencode-server.js')
      expect(getOpenCodeBaseURL()).toBe('http://127.0.0.1:4096')
    })
  })

  describe('isOpenCodeServerReady', () => {
    it('returns false initially', async () => {
      const { isOpenCodeServerReady } = await import('./opencode-server.js')
      expect(isOpenCodeServerReady()).toBe(false)
    })
  })

  describe('isOpenCodeInstalled', () => {
    it('returns false when opencode CLI is not found', async () => {
      const { isOpenCodeInstalled } = await import('./opencode-server.js')
      expect(isOpenCodeInstalled()).toBe(false)
    })
  })

  describe('stopOpenCodeServer', () => {
    it('does not throw when no server running', async () => {
      const { stopOpenCodeServer } = await import('./opencode-server.js')
      expect(() => stopOpenCodeServer()).not.toThrow()
    })
  })

  describe('startOpenCodeServer', () => {
    it('returns false when server disabled', async () => {
      mockConfig.OPENCODE_SERVER_ENABLED = false
      const { startOpenCodeServer } = await import('./opencode-server.js')
      const result = await startOpenCodeServer()
      expect(result).toBe(false)
    })

    it('returns false when opencode CLI not installed', async () => {
      const { startOpenCodeServer } = await import('./opencode-server.js')
      const result = await startOpenCodeServer()
      expect(result).toBe(false)
    })
  })
})
