import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  getDueTasks: vi.fn(() => []),
  markTaskRunning: vi.fn(),
  updateTaskAfterRun: vi.fn(),
  resetStuckTasks: vi.fn(),
  getNextQueuedMission: vi.fn(() => undefined),
  completeMission: vi.fn(),
  incrementTaskFailures: vi.fn(),
  resetTaskFailures: vi.fn(),
  getTaskFailures: vi.fn(() => 0),
  pauseTask: vi.fn(),
}))

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn(() => Promise.resolve({ text: 'result text' })),
}))

vi.mock('./errors.js', () => ({
  classifyError: vi.fn(() => ({ category: 'unknown', recovery: { shouldRetry: false, retryAfterMs: 0 } })),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  describe('computeNextRun', () => {
    it('returns next run time for valid cron expression', async () => {
      const { computeNextRun } = await import('./scheduler.js')
      const result = computeNextRun('0 0 * * *')
      expect(result).toBeTruthy()
      expect(() => new Date(result)).not.toThrow()
    })

    it('returns tomorrow for invalid cron expression', async () => {
      const { computeNextRun } = await import('./scheduler.js')
      const result = computeNextRun('invalid')
      expect(result).toBeTruthy()
    })
  })

  describe('initScheduler', () => {
    it('resets stuck tasks and starts polling', async () => {
      const { resetStuckTasks } = await import('./db.js')
      const { initScheduler, stopScheduler } = await import('./scheduler.js')
      const send = vi.fn()
      initScheduler(send, 'main')
      expect(resetStuckTasks).toHaveBeenCalledTimes(1)
      await stopScheduler()
    })
  })

  describe('stopScheduler', () => {
    it('stops without error when not started', async () => {
      const { stopScheduler } = await import('./scheduler.js')
      await expect(stopScheduler()).resolves.not.toThrow()
    })
  })
})
