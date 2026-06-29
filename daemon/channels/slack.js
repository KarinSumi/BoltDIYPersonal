export class SlackChannel {
  constructor(options = {}) {
    this.botToken = process.env.SLACK_BOT_TOKEN || options.botToken || ''
    this.signingSecret = process.env.SLACK_SIGNING_SECRET || options.signingSecret || ''
    this.apiBase = 'https://slack.com/api'
    this.onMessage = options.onMessage || (() => {})
    this.name = 'slack'
  }

  async start() {
    if (!this.botToken) throw new Error('SLACK_BOT_TOKEN not set')
  }

  stop() {}

  handleWebhook(req, res) {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body)

        if (payload.type === 'url_verification') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ challenge: payload.challenge }))
          return
        }

        if (payload.type === 'event_callback' && payload.event) {
          const event = payload.event
          if (event.type === 'message' && !event.bot_id && event.text) {
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
    const channel = event.channel || ''
    const user = event.user || ''
    const text = event.text || ''

    await this.onMessage({
      channel: 'slack',
      text,
      chatId: String(channel),
      userId: String(user),
      userName: user,
      raw: event,
      ts: Date.now(),
    })
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await fetch(`${this.apiBase}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.botToken}`,
      },
      body: JSON.stringify({
        channel: chatId,
        text,
        ...options,
      }),
    })
    const data = await response.json()
    return data.ok === true
  }
}
