import WebSocket from 'ws'

export class DiscordChannel {
  constructor(options = {}) {
    this.token = process.env.DISCORD_BOT_TOKEN || options.token || ''
    this.onMessage = options.onMessage || (() => {})
    this.name = 'discord'
    this.ws = null
    this.heartbeatInterval = null
    this.sequence = null
    this.sessionId = null
    this.guilds = new Map()
    this.channels = new Map()
  }

  async start() {
    if (!this.token) throw new Error('DISCORD_BOT_TOKEN not set')
    await this._connect()
  }

  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    if (this.ws) this.ws.close()
  }

  _connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')

      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          op: 2,
          d: {
            token: this.token,
            properties: { os: 'windows', browser: 'opencode', device: 'opencode' },
            intents: 1 << 15 | 1 << 9 | 1 << 0,
          },
        }))
      })

      this.ws.on('message', (data) => {
        const payload = JSON.parse(data.toString())

        if (payload.s) this.sequence = payload.s

        switch (payload.op) {
          case 10:
            this.heartbeatInterval = setInterval(() => {
              this.ws?.send(JSON.stringify({ op: 1, d: this.sequence }))
            }, payload.d.heartbeat_interval)
            resolve()
            break

          case 0:
            this._handleDispatch(payload)
            break

          case 7:
            this._reconnect()
            break

          case 9:
            this.sessionId = null
            this._connect()
            break
        }
      })

      this.ws.on('close', () => {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
        setTimeout(() => this._connect(), 5000)
      })

      this.ws.on('error', () => {})
    })
  }

  _handleDispatch(payload) {
    switch (payload.t) {
      case 'READY':
        this.sessionId = payload.d.session_id
        this.guilds.clear()
        for (const guild of payload.d.guilds) {
          this.guilds.set(guild.id, guild)
        }
        break

      case 'MESSAGE_CREATE':
        const msg = payload.d
        if (msg.author?.bot) return

        this.onMessage({
          channel: 'discord',
          text: msg.content,
          chatId: msg.channel_id,
          userId: msg.author.id,
          userName: msg.author.global_name || msg.author.username,
          guildId: msg.guild_id,
          raw: payload,
          ts: Date.now(),
        })
        break
    }
  }

  async sendMessage(channelId, text, options = {}) {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${this.token}`,
        },
        body: JSON.stringify({
          content: text,
          ...options,
        }),
      }
    )
    return response.ok
  }

  _reconnect() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    setTimeout(() => this._connect(), 1000)
  }
}
