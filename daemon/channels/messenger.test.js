import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessengerChannel } from './messenger.js'

function mockReq(opts = {}) {
  const url = opts.url || '/'
  return {
    url,
    method: opts.method || 'GET',
    headers: opts.headers || { host: 'localhost' },
    on: opts.on || ((evt, cb) => {}),
  }
}

function mockRes() {
  return { writeHead: vi.fn(), end: vi.fn() }
}

describe('MessengerChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('constructs with default values', () => {
    const channel = new MessengerChannel({ pageAccessToken: 'tok', appSecret: 'sec', webhookVerifyToken: 'ver' })
    expect(channel).toBeDefined()
    expect(channel.name).toBe('messenger')
  })

  it('reads from env vars', () => {
    process.env.MESSENGER_PAGE_ACCESS_TOKEN = 'env_tok'
    process.env.MESSENGER_APP_SECRET = 'env_sec'
    const channel = new MessengerChannel()
    expect(channel.pageAccessToken).toBe('env_tok')
    expect(channel.appSecret).toBe('env_sec')
    delete process.env.MESSENGER_PAGE_ACCESS_TOKEN
    delete process.env.MESSENGER_APP_SECRET
  })

  it('start() throws if no token', async () => {
    const channel = new MessengerChannel()
    await expect(channel.start()).rejects.toThrow('MESSENGER_PAGE_ACCESS_TOKEN')
  })

  it('start() resolves with token', async () => {
    const channel = new MessengerChannel({ pageAccessToken: 'tok' })
    await expect(channel.start()).resolves.toBeUndefined()
  })

  it('handleWebhook GET verifies token', () => {
    const channel = new MessengerChannel({ webhookVerifyToken: 'myverify' })
    const req = mockReq({
      url: 'http://localhost/?hub.mode=subscribe&hub.verify_token=myverify&hub.challenge=abc123',
    })
    const res = mockRes()
    channel.handleWebhook(req, res)
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/plain' })
    expect(res.end).toHaveBeenCalledWith('abc123')
  })

  it('handleWebhook GET rejects wrong token', () => {
    const channel = new MessengerChannel({ webhookVerifyToken: 'myverify' })
    const req = mockReq({
      url: 'http://localhost/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    })
    const res = mockRes()
    channel.handleWebhook(req, res)
    expect(res.writeHead).toHaveBeenCalledWith(403)
    expect(res.end).toHaveBeenCalledWith('Forbidden')
  })

  it('handleWebhook POST processes messaging events', async () => {
    const onMessage = vi.fn()
    const channel = new MessengerChannel({ pageAccessToken: 'tok', onMessage })
    const payload = JSON.stringify({
      entry: [{
        messaging: [{
          sender: { id: 'user1' },
          message: { text: 'Hello' },
        }],
      }],
    })
    let dataCb, endCb
    const req = mockReq({
      method: 'POST',
      on: (evt, cb) => {
        if (evt === 'data') dataCb = cb
        if (evt === 'end') endCb = cb
      },
    })
    const res = mockRes()
    channel.handleWebhook(req, res)
    dataCb(payload)
    endCb()
    await new Promise(r => setTimeout(r, 10))
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'messenger',
        text: 'Hello',
        chatId: 'user1',
        userId: 'user1',
      })
    )
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' })
  })

  it('handleWebhook POST returns 400 on bad JSON', async () => {
    const channel = new MessengerChannel({ pageAccessToken: 'tok' })
    let dataCb, endCb
    const req = mockReq({
      method: 'POST',
      on: (evt, cb) => {
        if (evt === 'data') dataCb = cb
        if (evt === 'end') endCb = cb
      },
    })
    const res = mockRes()
    channel.handleWebhook(req, res)
    dataCb('not json')
    endCb()
    await new Promise(r => setTimeout(r, 10))
    expect(res.writeHead).toHaveBeenCalledWith(400)
  })

  it('_handleEvent calls onMessage with formatted data', async () => {
    const onMessage = vi.fn()
    const channel = new MessengerChannel({ pageAccessToken: 'tok', onMessage })
    const event = {
      sender: { id: 'user1' },
      message: { text: 'hi' },
    }
    await channel._handleEvent(event)
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'messenger',
        text: 'hi',
        chatId: 'user1',
        userId: 'user1',
      })
    )
  })

  it('sendMessage posts to Graph API', async () => {
    const channel = new MessengerChannel({ pageAccessToken: 'tok' })
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    const result = await channel.sendMessage('user1', 'Hello')
    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/me/messages?access_token=tok',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"recipient":{"id":"user1"}'),
      })
    )
    delete global.fetch
  })
})
