import { describe, it, expect, vi } from 'vitest'
import { SlackChannel } from './slack.js'

describe('SlackChannel', () => {
  it('throws if no token configured', async () => {
    const ch = new SlackChannel()
    await expect(ch.start()).rejects.toThrow('SLACK_BOT_TOKEN')
  })

  it('handles url_verification challenge', () => {
    const ch = new SlackChannel({ botToken: 'test' })
    const mockReq = {
      on: (evt, cb) => {
        if (evt === 'data') cb(JSON.stringify({ type: 'url_verification', challenge: 'challenge123' }))
        if (evt === 'end') cb()
      },
    }
    const mockRes = { writeHead: vi.fn(), end: vi.fn() }
    ch.handleWebhook(mockReq, mockRes)
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.anything())
    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ challenge: 'challenge123' }))
  })

  it('parses message event and calls onMessage', async () => {
    const onMessage = vi.fn()
    const ch = new SlackChannel({ botToken: 'test', onMessage })

    const mockReq = {
      on: (evt, cb) => {
        if (evt === 'data') cb(JSON.stringify({
          type: 'event_callback',
          event: {
            type: 'message',
            text: 'Hello Slack',
            channel: 'C123',
            user: 'U456',
          },
        }))
        if (evt === 'end') cb()
      },
    }
    const mockRes = { writeHead: vi.fn(), end: vi.fn() }
    ch.handleWebhook(mockReq, mockRes)

    await new Promise(r => setTimeout(r, 50))

    expect(onMessage).toHaveBeenCalledTimes(1)
    const msg = onMessage.mock.calls[0][0]
    expect(msg.channel).toBe('slack')
    expect(msg.text).toBe('Hello Slack')
    expect(msg.chatId).toBe('C123')
  })

  it('sendMessage calls Slack API', async () => {
    const ch = new SlackChannel({ botToken: 'xoxb-test' })
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ ok: true }) })
    const result = await ch.sendMessage('C123', 'Reply')
    expect(result).toBe(true)
  })
})
