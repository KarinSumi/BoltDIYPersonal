export class MessengerChannel {
  constructor(options = {}) {
    this.pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN || options.pageAccessToken || ''
    this.appSecret = process.env.MESSENGER_APP_SECRET || options.appSecret || ''
    this.apiBase = 'https://graph.facebook.com/v21.0/me'
    this.webhookVerifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN || options.webhookVerifyToken || 'opencode-verify'
    this.onMessage = options.onMessage || (() => {})
    this.name = 'messenger'
  }

  async start() {
    if (!this.pageAccessToken) throw new Error('MESSENGER_PAGE_ACCESS_TOKEN not set')
  }

  stop() {}

  handleWebhook(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET') {
      const mode = parsedUrl.searchParams.get('hub.mode')
      const token = parsedUrl.searchParams.get('hub.verify_token')
      const challenge = parsedUrl.searchParams.get('hub.challenge')

      if (mode === 'subscribe' && token === this.webhookVerifyToken) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(challenge)
      } else {
        res.writeHead(403)
        res.end('Forbidden')
      }
      return
    }

    if (req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body)
          const entries = payload.entry || []
          for (const entry of entries) {
            const messaging = entry.messaging || []
            for (const event of messaging) {
              if (event.message && event.message.text) {
                await this._handleEvent(event)
              }
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
  }

  async _handleEvent(event) {
    const senderId = event.sender?.id || ''
    const text = event.message?.text || ''
    const userName = senderId

    await this.onMessage({
      channel: 'messenger',
      text,
      chatId: String(senderId),
      userId: String(senderId),
      userName,
      raw: event,
      ts: Date.now(),
    })
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await fetch(`${this.apiBase}/messages?access_token=${this.pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: chatId },
        message: { text },
        ...options,
      }),
    })
    return response.ok
  }
}
