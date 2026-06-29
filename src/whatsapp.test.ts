import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  insertMission: vi.fn(),
}))

vi.mock('./db.js', () => mockDb)

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

describe('whatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendMessage', () => {
    it('queues a mission and returns true', async () => {
      const { sendMessage } = await import('./whatsapp.js')
      const result = await sendMessage('123', 'Hello')
      expect(result).toBe(true)
      expect(mockDb.insertMission).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'WhatsApp to 123',
          prompt: 'Send a WhatsApp message to 123: Hello',
          assigned_agent: 'comms',
        })
      )
    })
  })

  describe('handleIncoming', () => {
    it('calls message handler when set', async () => {
      const { setMessageHandler, handleIncoming } = await import('./whatsapp.js')
      const handler = vi.fn()
      setMessageHandler(handler)
      handleIncoming('456', 'Hi there')
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '456',
          body: 'Hi there',
        })
      )
    })

    it('does not throw when no handler set', async () => {
      const { handleIncoming } = await import('./whatsapp.js')
      expect(() => handleIncoming('456', 'Hi')).not.toThrow()
    })
  })

  describe('formatWhatsAppMessage', () => {
    it('formats a WhatsApp message', () => {
      const { formatWhatsAppMessage } = import('./whatsapp.js') as any
    })
  })

  describe('formatWhatsAppMessage', () => {
    it('formats message with from and body', async () => {
      const { formatWhatsAppMessage } = await import('./whatsapp.js')
      const msg = { id: 'msg-1', from: '555', body: 'Hello', timestamp: Date.now() }
      const result = formatWhatsAppMessage(msg)
      expect(result).toContain('555')
      expect(result).toContain('Hello')
    })
  })
})
