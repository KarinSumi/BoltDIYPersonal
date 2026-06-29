import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiscordChannel } from './discord.js'

describe('DiscordChannel', () => {
  let channel

  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = 'discord-test-token'
    channel = new DiscordChannel({ onMessage: vi.fn() })
  })

  afterEach(() => {
    channel.stop()
  })

  it('requires token', async () => {
    delete process.env.DISCORD_BOT_TOKEN
    const c = new DiscordChannel()
    await expect(c.start()).rejects.toThrow('DISCORD_BOT_TOKEN')
  })

  it('handles dispatch events', () => {
    channel._handleDispatch({
      t: 'READY',
      d: { session_id: 'sess1', guilds: [{ id: 'g1', name: 'Test' }] },
    })
    expect(channel.sessionId).toBe('sess1')
  })

  it('processes message create events', () => {
    channel._handleDispatch({
      t: 'MESSAGE_CREATE',
      d: {
        id: 'm1',
        channel_id: 'c1',
        guild_id: 'g1',
        author: { id: 'u1', username: 'TestUser', bot: false },
        content: 'Hello Discord',
        timestamp: new Date().toISOString(),
      },
    })
    expect(channel.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'discord',
        text: 'Hello Discord',
        chatId: 'c1',
      })
    )
  })

  it('ignores bot messages', () => {
    channel._handleDispatch({
      t: 'MESSAGE_CREATE',
      d: {
        id: 'm2',
        channel_id: 'c1',
        author: { id: 'bot1', username: 'Bot', bot: true },
        content: 'I am a bot',
      },
    })
    expect(channel.onMessage).not.toHaveBeenCalled()
  })
})
