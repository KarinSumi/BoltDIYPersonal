import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockGetDb = vi.fn()
const mockInitDb = vi.fn()
const mockGetClient = vi.fn()
const mockResetClient = vi.fn()
const mockHeartbeatAgent = vi.fn()
const mockEmitHeartbeat = vi.fn()

vi.mock('./db.js', () => ({
  getDb: () => mockGetDb(),
  initDatabase: () => mockInitDb(),
}))

vi.mock('./llm-client.js', () => ({
  getClient: () => mockGetClient(),
  resetClient: () => mockResetClient(),
}))

vi.mock('./kanban-db.js', () => ({
  heartbeatAgent: () => mockHeartbeatAgent(),
}))

vi.mock('./events.js', () => ({
  emitHeartbeat: (...args: unknown[]) => mockEmitHeartbeat(...args),
}))

vi.mock('./state.js', () => ({
  lastActivityAt: Date.now(),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

async function resetHeartbeat() {
  const mod = await import('./heartbeat.js')
  mod.stopHeartbeat()
}

describe('heartbeat', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    await resetHeartbeat()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts and stops without error', async () => {
    mockGetDb.mockReturnValue({ prepare: () => ({ get: () => true }) })
    mockGetClient.mockReturnValue({})
    mockHeartbeatAgent.mockReturnValue(undefined)
    const { startHeartbeat, stopHeartbeat } = await import('./heartbeat.js')
    startHeartbeat()
    expect(mockGetDb).not.toHaveBeenCalled() // not until first tick
    stopHeartbeat()
  })

  it('reports ok when all checks pass', async () => {
    mockGetDb.mockReturnValue({ prepare: () => ({ get: () => true }) })
    mockGetClient.mockReturnValue({})
    mockHeartbeatAgent.mockReturnValue(undefined)
    const { startHeartbeat, stopHeartbeat } = await import('./heartbeat.js')
    startHeartbeat()
    await vi.advanceTimersByTimeAsync(31000)
    expect(mockEmitHeartbeat).toHaveBeenCalledWith('ok')
    stopHeartbeat()
  })

  it('recovers from DB failure', async () => {
    const mockDb = { prepare: vi.fn().mockReturnValue({ get: vi.fn().mockImplementation(() => { throw new Error('db down') }) }) }
    mockGetDb.mockReturnValue(mockDb)
    mockGetClient.mockReturnValue({})
    mockHeartbeatAgent.mockReturnValue(undefined)
    mockInitDb.mockImplementation(() => { mockGetDb.mockReturnValue({ prepare: () => ({ get: () => true }) }) })

    const { startHeartbeat, stopHeartbeat } = await import('./heartbeat.js')
    startHeartbeat()
    await vi.advanceTimersByTimeAsync(31000)
    expect(mockInitDb).toHaveBeenCalled()
    stopHeartbeat()
  })

  it('recovers from LLM client failure', async () => {
    mockGetDb.mockReturnValue({ prepare: () => ({ get: () => true }) })
    mockGetClient
      .mockImplementationOnce(() => { throw new Error('llm down') })
      .mockImplementationOnce(() => ({}))
    mockHeartbeatAgent.mockReturnValue(undefined)

    const { startHeartbeat, stopHeartbeat } = await import('./heartbeat.js')
    startHeartbeat()
    await vi.advanceTimersByTimeAsync(31000)
    expect(mockResetClient).toHaveBeenCalled()
    expect(mockGetClient).toHaveBeenCalledTimes(2)
    stopHeartbeat()
  })

  it('emits degraded when some checks fail', async () => {
    mockGetDb.mockReturnValue({ prepare: () => ({ get: () => true }) })
    mockGetClient.mockImplementation(() => { throw new Error('llm down') })
    mockResetClient.mockImplementation(() => {})
    mockHeartbeatAgent.mockReturnValue(undefined)

    const { startHeartbeat, stopHeartbeat } = await import('./heartbeat.js')
    startHeartbeat()
    await vi.advanceTimersByTimeAsync(31000)
    expect(mockEmitHeartbeat).toHaveBeenCalledWith('degraded')
    stopHeartbeat()
  })

  it('increments consecutiveDown on down status', async () => {
    const dbThrow = vi.fn().mockImplementation(() => { throw new Error('db down') })
    mockGetDb.mockReturnValue({ prepare: () => ({ get: dbThrow }) })
    mockInitDb.mockImplementation(() => { throw new Error('init also fails') })
    mockGetClient.mockImplementation(() => { throw new Error('llm down') })
    mockHeartbeatAgent.mockImplementation(() => { throw new Error('agent down') })
    mockResetClient.mockImplementation(() => {})

    const { startHeartbeat, stopHeartbeat, getConsecutiveDown } = await import('./heartbeat.js')
    startHeartbeat()
    await vi.advanceTimersByTimeAsync(31000)
    expect(getConsecutiveDown()).toBe(1)
    stopHeartbeat()
  })
})
