import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('events', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emitEvent forwards to SSE subscribers', async () => {
    const { emitEvent, subscribeToSSE } = await import('./events.js')
    const cb = vi.fn()
    const unsub = subscribeToSSE(cb)
    emitEvent('test', { foo: 'bar' })
    expect(cb).toHaveBeenCalledWith('test', { foo: 'bar' })
    unsub()
  })

  it('subscribeToSSE returns unsubscribe function', async () => {
    const { subscribeToSSE, getSSEClientCount } = await import('./events.js')
    const cb = vi.fn()
    const unsub = subscribeToSSE(cb)
    expect(getSSEClientCount()).toBeGreaterThanOrEqual(1)
    unsub()
    expect(getSSEClientCount()).toBeGreaterThanOrEqual(0)
  })

  it('getRecentActivity returns activity entries', async () => {
    const { pushActivityEntry, getRecentActivity } = await import('./events.js')
    pushActivityEntry('test_event', 'test summary', 1000)
    const recent = getRecentActivity()
    expect(recent.length).toBeGreaterThanOrEqual(1)
    expect(recent[0].event).toBe('test_event')
    expect(recent[0].summary).toBe('test summary')
  })

  it('getRecentActivity respects limit', async () => {
    const { pushActivityEntry, getRecentActivity } = await import('./events.js')
    for (let i = 0; i < 10; i++) {
      pushActivityEntry('bulk', `entry ${i}`, i)
    }
    const recent = getRecentActivity(3)
    expect(recent.length).toBe(3)
  })

  it('emitHeartbeat pushes activity and emits event', async () => {
    const { emitHeartbeat, getRecentActivity, getSSEClientCount, subscribeToSSE } =
      await import('./events.js')
    const cb = vi.fn()
    subscribeToSSE(cb)
    emitHeartbeat('ok')
    expect(cb).toHaveBeenCalledWith('heartbeat_tick', expect.objectContaining({ status: 'ok' }))
    const recent = getRecentActivity(1)
    expect(recent[0].event).toBe('heartbeat_tick')
    expect(recent[0].summary).toContain('ok')
  })

  it('pushActivityEntry uses Date.now() when no timestamp given', async () => {
    const { pushActivityEntry, getRecentActivity } = await import('./events.js')
    const before = Date.now()
    pushActivityEntry('timeless', 'no timestamp')
    const recent = getRecentActivity(1)
    expect(recent[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(recent[0].timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('chatEvents from state wire through to activity', async () => {
    const { chatEvents } = await import('./state.js')
    const { getRecentActivity } = await import('./events.js')
    chatEvents.emit('task', {
      taskId: 'abc123',
      agentId: 'agent-1',
      status: 'completed',
      timestamp: 5000,
    })
    const recent = getRecentActivity(5)
    const match = recent.find((e) => e.event === 'task_completed')
    expect(match).toBeTruthy()
    expect(match!.summary).toContain('abc123')
  })
})
