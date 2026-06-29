import { describe, it, expect, vi } from 'vitest'
import { WhatsAppChannel } from './whatsapp.js'

describe('WhatsAppChannel', () => {
  it('throws if no phone number ID', async () => {
    const ch = new WhatsAppChannel()
    await expect(ch.start()).rejects.toThrow('WHATSAPP_PHONE_NUMBER_ID')
  })

  it('handles webhook verification GET', () => {
    const ch = new WhatsAppChannel({ phoneNumberId: 'test' })
    const mockReq = {
      method: 'GET',
      url: '/webhook?hub.mode=subscribe&hub.verify_token=opencode-verify&hub.challenge=abc123',
      headers: {},
    }
    const mockRes = { writeHead: vi.fn(), end: vi.fn() }
    ch.handleWebhook(mockReq, mockRes)
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.anything())
    expect(mockRes.end).toHaveBeenCalledWith('abc123')
  })

  it('rejects wrong verify token', () => {
    const ch = new WhatsAppChannel({ phoneNumberId: 'test' })
    const mockReq = {
      method: 'GET',
      url: '/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
      headers: {},
    }
    const mockRes = { writeHead: vi.fn(), end: vi.fn() }
    ch.handleWebhook(mockReq, mockRes)
    expect(mockRes.writeHead).toHaveBeenCalledWith(403)
  })

  it('parses incoming message and calls onMessage', async () => {
    const onMessage = vi.fn()
    const ch = new WhatsAppChannel({ phoneNumberId: 'test', onMessage })

    const mockReq = {
      method: 'POST',
      headers: {},
      on: (evt, cb) => {
        if (evt === 'data') cb(JSON.stringify({
          entry: [{
            changes: [{
              field: 'messages',
              value: {
                messages: [{ from: '15551234567', id: 'wamid123', type: 'text', text: { body: 'Hello WhatsApp' } }],
                contacts: [{ profile: { name: 'Alice' } }],
              },
            }],
          }],
        }))
        if (evt === 'end') cb()
      },
    }
    const mockRes = { writeHead: vi.fn(), end: vi.fn() }
    ch.handleWebhook(mockReq, mockRes)

    await new Promise(r => setTimeout(r, 50))

    expect(onMessage).toHaveBeenCalledTimes(1)
    const msg = onMessage.mock.calls[0][0]
    expect(msg.channel).toBe('whatsapp')
    expect(msg.text).toBe('Hello WhatsApp')
    expect(msg.chatId).toBe('15551234567')
    expect(msg.userName).toBe('Alice')
  })
})
