export class WhatsAppChannel {
  constructor(options = {}) {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || options.phoneNumberId || ''
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || options.accessToken || ''
    this.apiBase = `https://graph.facebook.com/v21.0/${this.phoneNumberId}`
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || options.webhookVerifyToken || 'opencode-verify'
    this.onMessage = options.onMessage || (() => {})
    this.name = 'whatsapp'
  }

  async start() {
    if (!this.phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not set')
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
            const changes = entry.changes || []
            for (const change of changes) {
              if (change.field === 'messages') {
                const messages = change.value?.messages || []
                for (const msg of messages) {
                  if (msg.type === 'text') {
                    await this._handleMessage(msg, change.value)
                  }
                }
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

  async _handleMessage(msg, value) {
    const from = msg.from || ''
    const text = msg.text?.body || ''
    const userName = value.contacts?.[0]?.profile?.name || from

    await this.onMessage({
      channel: 'whatsapp',
      text,
      chatId: String(from),
      userId: String(from),
      userName,
      raw: { message: msg, metadata: value },
      ts: Date.now(),
    })
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await fetch(`${this.apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: chatId,
        type: 'text',
        text: { body: text, preview_url: false },
        ...options,
      }),
    })
    return response.ok
  }
}
