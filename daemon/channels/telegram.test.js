import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelegramChannel } from './telegram.js'

describe('TelegramChannel', () => {
  let channel

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test:token'
    channel = new TelegramChannel({ onMessage: vi.fn(), pollInterval: 100 })
  })

  afterEach(() => {
    channel.stop()
  })

  it('requires token', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const c = new TelegramChannel()
    await expect(c.start()).rejects.toThrow('TELEGRAM_BOT_TOKEN')
  })

  it('processes incoming updates', async () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123, first_name: 'Test' },
        chat: { id: 456 },
        text: 'Hello',
        date: Math.floor(Date.now() / 1000),
      },
    }
    await channel._handleUpdate(update)
    expect(channel.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        text: 'Hello',
        chatId: '456',
        userId: '123',
        userName: 'Test',
      })
    )
  })

  it('handles callback queries', async () => {
    const update = {
      update_id: 2,
      callback_query: {
        id: 'cq1',
        from: { id: 789, first_name: 'Callback' },
        message: { chat: { id: 101 } },
        data: 'btn_click',
      },
    }
    await channel._handleUpdate(update)
    expect(channel.onMessage).toHaveBeenCalled()
  })
})
