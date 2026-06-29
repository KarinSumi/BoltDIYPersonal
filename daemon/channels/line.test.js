import { describe, it, expect, vi } from 'vitest'
import { LineChannel } from './line.js'

describe('LineChannel', () => {
  it('throws if no token configured', async () => {
    const ch = new LineChannel()
    await expect(ch.start()).rejects.toThrow('LINE_CHANNEL_ACCESS_TOKEN')
  })

  it('accepts token via options', async () => {
    const ch = new LineChannel({ channelToken: 'test-token', onMessage: vi.fn() })
    await expect(ch.start()).resolves.not.toThrow()
    expect(ch.channelToken).toBe('test-token')
  })

  it('parses text message webhook and calls onMessage', async () => {
    const onMessage = vi.fn()
    const ch = new LineChannel({ channelToken: 'test', onMessage })

    const mockReq = {
      headers: { 'x-line-signature': 'sig' },
      on: (evt, cb) => {
        if (evt === 'data') cb(JSON.stringify({
          events: [{
            type: 'message',
            message: { type: 'text', text: 'Hello LINE' },
            source: { userId: 'u123', type: 'user' },
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
    expect(msg.channel).toBe('line')
    expect(msg.text).toBe('Hello LINE')
    expect(msg.chatId).toBe('u123')
  })

  it('sendMessage calls LINE push API', async () => {
    const ch = new LineChannel({ channelToken: 'test-token' })
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    const result = await ch.sendMessage('u123', 'Reply')
    expect(result).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      }),
    )
  })
})
