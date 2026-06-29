import { logger } from './logger.js'

type QueuedTask = () => Promise<void>

const queues = new Map<string, QueuedTask[]>()
const processing = new Set<string>()

export async function enqueue(chatId: string, task: QueuedTask): Promise<void> {
  const queue = queues.get(chatId) || []
  queue.push(task)
  queues.set(chatId, queue)

  if (!processing.has(chatId)) {
    await processQueue(chatId)
  }
}

async function processQueue(chatId: string): Promise<void> {
  processing.add(chatId)

  while (true) {
    const queue = queues.get(chatId)
    if (!queue || queue.length === 0) {
      processing.delete(chatId)
      queues.delete(chatId)
      return
    }

    const task = queue.shift()!
    try {
      await task()
    } catch (err) {
      logger.error({ chatId, err: (err as Error).message }, 'Queue error')
    }
  }
}
