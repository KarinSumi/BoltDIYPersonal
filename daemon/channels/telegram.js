export class TelegramChannel {
  constructor(options = {}) {
    this.token = process.env.TELEGRAM_BOT_TOKEN || options.token || ''
    this.apiBase = `https://api.telegram.org/bot${this.token}`
    this.onMessage = options.onMessage || (() => {})
    this.lastUpdateId = 0
    this.polling = false
    this.pollInterval = options.pollInterval || 1000
    this.name = 'telegram'
  }

  async start() {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN not set')
    this.polling = true
    this._poll()
  }

  stop() {
    this.polling = false
  }

  async _poll() {
    while (this.polling) {
      try {
        const response = await fetch(
          `${this.apiBase}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`,
          { signal: AbortSignal.timeout(35000) }
        )
        if (!response.ok) {
          await this._sleep(5000)
          continue
        }

        const data = await response.json()
        if (data.ok && data.result?.length > 0) {
          for (const update of data.result) {
            if (update.update_id > this.lastUpdateId) {
              this.lastUpdateId = update.update_id
              await this._handleUpdate(update)
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          await this._sleep(5000)
        }
      }
    }
  }

  async _handleUpdate(update) {
    const msg = update.message || update.channel_post || update.callback_query?.message
    if (!msg) return

    const text = msg.text || msg.caption || ''
    const chatId = msg.chat?.id
    const fromId = msg.from?.id
    const fromName = msg.from?.first_name || 'User'

    await this.onMessage({
      channel: 'telegram',
      text,
      chatId: String(chatId),
      userId: String(fromId),
      userName: fromName,
      raw: update,
      ts: Date.now(),
    })
  }

  async sendMessage(chatId, text, options = {}) {
    const response = await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options,
      }),
    })
    return response.ok
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
  }
}
