import { TelegramChannel } from './channels/telegram.js'
import { DiscordChannel } from './channels/discord.js'
import { LineChannel } from './channels/line.js'
import { SlackChannel } from './channels/slack.js'
import { WhatsAppChannel } from './channels/whatsapp.js'
import { MessengerChannel } from './channels/messenger.js'

export class ChannelManager {
  constructor(options = {}) {
    this.onMessage = options.onMessage || (() => {})
    this.channels = new Map()
  }

  async loadAll() {
    const adapters = [
      { id: 'telegram', Class: TelegramChannel },
      { id: 'discord', Class: DiscordChannel },
      { id: 'line', Class: LineChannel },
      { id: 'slack', Class: SlackChannel },
      { id: 'whatsapp', Class: WhatsAppChannel },
      { id: 'messenger', Class: MessengerChannel },
    ]

    for (const { id, Class } of adapters) {
      try {
        if (Class) {
          const instance = new Class({ onMessage: this.onMessage })
          await instance.start()
          this.channels.set(id, instance)
        }
      } catch (err) {
        console.error(`[Channels] Failed to start ${id}:`, err.message)
      }
    }
  }

  get(id) {
    return this.channels.get(id) || null
  }

  list() {
    return Array.from(this.channels.keys())
  }

  async sendTo(id, ...args) {
    const channel = this.channels.get(id)
    if (channel?.sendMessage) {
      return channel.sendMessage(...args)
    }
    return false
  }

  async broadcast(text, options = {}) {
    const results = []
    for (const [id, channel] of this.channels) {
      if (channel.sendMessage) {
        try {
          const result = await channel.sendMessage(options.chatId || options.defaultChatId, text)
          results.push({ channel: id, ok: result })
        } catch (err) {
          results.push({ channel: id, ok: false, error: err.message })
        }
      }
    }
    return results
  }

  stop() {
    for (const [, channel] of this.channels) {
      if (channel.stop) channel.stop()
    }
  }
}
