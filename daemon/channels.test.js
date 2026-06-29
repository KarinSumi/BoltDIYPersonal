import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ChannelManager } from './channels.js'

describe('ChannelManager', () => {
  let manager

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test:token'
    process.env.DISCORD_BOT_TOKEN = 'discord-test-token'
    manager = new ChannelManager({ onMessage: vi.fn() })
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.DISCORD_BOT_TOKEN
    manager.stop()
  })

  it('loads available channels', async () => {
    await manager.loadAll()
    expect(manager.list().length).toBeGreaterThanOrEqual(1)
  })

  it('returns null for unknown channel', () => {
    expect(manager.get('unknown')).toBeNull()
  })

  it('handles broadcast gracefully', async () => {
    const results = await manager.broadcast('test message', { defaultChatId: '123' })
    expect(Array.isArray(results)).toBe(true)
  })
})
