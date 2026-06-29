import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  TELEGRAM_BOT_TOKEN: '',
  ALLOWED_CHAT_ID: '',
}))

vi.mock('./config.js', () => mockConfig)

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('telegram', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    originalFetch = globalThis.fetch
    mockConfig.TELEGRAM_BOT_TOKEN = ''
    mockConfig.ALLOWED_CHAT_ID = ''
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('sendTelegramMessage', () => {
    it('returns false when no bot token configured', async () => {
      const { sendTelegramMessage } = await import('./telegram.js')
      const result = await sendTelegramMessage('123', 'hello')
      expect(result).toBe(false)
    })

    it('sends message successfully and returns true', async () => {
      mockConfig.TELEGRAM_BOT_TOKEN = 'test-token'
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true } as Response))
      const { sendTelegramMessage } = await import('./telegram.js')
      const result = await sendTelegramMessage('123', 'hello', 'HTML')
      expect(result).toBe(true)
    })

    it('handles non-retryable error', async () => {
      mockConfig.TELEGRAM_BOT_TOKEN = 'test-token'
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('Bad request'), headers: new Map() } as unknown as Response))
      const { sendTelegramMessage } = await import('./telegram.js')
      const result = await sendTelegramMessage('123', 'hello')
      expect(result).toBe(false)
    })
  })

  describe('getAllowedChatIds', () => {
    it('returns empty array when ALLOWED_CHAT_ID is empty', async () => {
      const { getAllowedChatIds } = await import('./telegram.js')
      expect(getAllowedChatIds()).toEqual([])
    })

    it('parses comma-separated chat IDs', async () => {
      mockConfig.ALLOWED_CHAT_ID = '123,456,789'
      const { getAllowedChatIds } = await import('./telegram.js')
      expect(getAllowedChatIds()).toEqual(['123', '456', '789'])
    })

    it('trims whitespace from IDs', async () => {
      mockConfig.ALLOWED_CHAT_ID = ' 123 , 456 '
      const { getAllowedChatIds } = await import('./telegram.js')
      expect(getAllowedChatIds()).toEqual(['123', '456'])
    })
  })
})
