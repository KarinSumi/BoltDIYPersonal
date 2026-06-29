export class LineChannel {
  constructor(options = {}) {
    this.channelSecret = process.env.LINE_CHANNEL_SECRET || options.channelSecret || ''
    this.channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || options.channelToken || ''
    this.apiBase = 'https://api.line.me/v2/bot'
    this.onMessage = options.onMessage || (() => {})
    this.routes = {}
    this.name = 'line'
  }

  async start() {
    if (!this.channelToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set')
  }

  stop() {}

  handleWebhook(req, res) {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const signature = req.headers['x-line-signature'] || ''
        const events = JSON.parse(body).events || []
        for (const event of events) {
          if (event.type === 'message' && event.message?.type === 'text') {
            await this._handleEvent(event)
          }
          if (event.type === 'follow' || event.type === 'join') {
            await this._handleEvent(event)
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      } catch {
        res.writeHead(400)
        res.end('Bad Request')
      }
    })
  }

  async _handleEvent(event) {
    const userId = event.source?.userId || ''
    const groupId = event.source?.groupId || ''
    const roomId = event.source?.roomId || ''
    const chatId = groupId || roomId || userId
    const text = event.message?.text || ''

    await this.onMessage({
      channel: 'line',
      text,
      chatId: String(chatId),
      userId: String(userId),
      userName: userId,
      raw: event,
      ts: Date.now(),
    })
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await fetch(`${this.apiBase}/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.channelToken}`,
      },
      body: JSON.stringify({
        to: chatId,
        messages: [{ type: 'text', text }],
        ...options,
      }),
    })
    return response.ok
  }

  async replyMessage(replyToken, text) {
    const response = await fetch(`${this.apiBase}/message/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.channelToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
    })
    return response.ok
  }
}
