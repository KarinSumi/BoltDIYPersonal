import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('message-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueue processes a single task', async () => {
    const { enqueue } = await import('./message-queue.js')
    const task = vi.fn(() => Promise.resolve())
    await enqueue('chat-1', task)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('enqueue processes multiple tasks in order', async () => {
    const { enqueue } = await import('./message-queue.js')
    const order: number[] = []
    await enqueue('chat-1', async () => { order.push(1) })
    await enqueue('chat-1', async () => { order.push(2) })
    await enqueue('chat-1', async () => { order.push(3) })
    expect(order).toEqual([1, 2, 3])
  })

  it('enqueue processes tasks independently per chatId', async () => {
    const { enqueue } = await import('./message-queue.js')
    const orderA: number[] = []
    const orderB: number[] = []
    await Promise.all([
      enqueue('chat-a', async () => { orderA.push(1) }),
      enqueue('chat-b', async () => { orderB.push(1) }),
      enqueue('chat-a', async () => { orderA.push(2) }),
      enqueue('chat-b', async () => { orderB.push(2) }),
    ])
    expect(orderA).toEqual([1, 2])
    expect(orderB).toEqual([1, 2])
  })

  it('continues processing even if a task throws', async () => {
    const { enqueue } = await import('./message-queue.js')
    const order: number[] = []
    await enqueue('chat-1', async () => { order.push(1) })
    await enqueue('chat-1', async () => { throw new Error('fail') })
    await enqueue('chat-1', async () => { order.push(2) })
    expect(order).toEqual([1, 2])
  })
})
