import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('SSE Event Bus', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emitEvent delivers to subscriber', async () => {
    const { emitEvent, subscribeToSSE } = await import('./events.js')
    const cb = vi.fn()
    const unsub = subscribeToSSE(cb)
    emitEvent('test_event', { foo: 'bar' })
    expect(cb).toHaveBeenCalledWith('test_event', { foo: 'bar' })
    unsub()
  })

  it('unsubscribe removes listener', async () => {
    const { emitEvent, subscribeToSSE } = await import('./events.js')
    const cb = vi.fn()
    const unsub = subscribeToSSE(cb)
    unsub()
    emitEvent('test_event', { foo: 'bar' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('getSSEClientCount returns correct count', async () => {
    const { subscribeToSSE, getSSEClientCount } = await import('./events.js')
    expect(getSSEClientCount()).toBe(0)
    const unsub1 = subscribeToSSE(() => {})
    expect(getSSEClientCount()).toBe(1)
    const unsub2 = subscribeToSSE(() => {})
    expect(getSSEClientCount()).toBe(2)
    unsub1()
    expect(getSSEClientCount()).toBe(1)
    unsub2()
    expect(getSSEClientCount()).toBe(0)
  })

  it('emitHeartbeat emits heartbeat_tick event', async () => {
    const { emitHeartbeat, subscribeToSSE } = await import('./events.js')
    const cb = vi.fn()
    subscribeToSSE(cb)
    emitHeartbeat('ok')
    expect(cb).toHaveBeenCalledWith('heartbeat_tick', expect.objectContaining({ status: 'ok' }))
  })

  it('error in callback does not throw', async () => {
    const { emitEvent, subscribeToSSE } = await import('./events.js')
    subscribeToSSE(() => { throw new Error('boom') })
    expect(() => emitEvent('test', {})).not.toThrow()
  })

  it('multiple clients receive same event', async () => {
    const { emitEvent, subscribeToSSE } = await import('./events.js')
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeToSSE(cb1)
    subscribeToSSE(cb2)
    emitEvent('multi', { x: 1 })
    expect(cb1).toHaveBeenCalledWith('multi', { x: 1 })
    expect(cb2).toHaveBeenCalledWith('multi', { x: 1 })
  })
})

describe('Activity feed', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getRecentActivity returns events in reverse order', async () => {
    const { pushActivityEntry, getRecentActivity } = await import('./events.js')
    pushActivityEntry('test_a', 'first')
    pushActivityEntry('test_b', 'second')
    pushActivityEntry('test_c', 'third')
    const recent = getRecentActivity(10)
    expect(recent.length).toBe(3)
    expect(recent[0].event).toBe('test_c')
    expect(recent[2].event).toBe('test_a')
  })

  it('getRecentActivity respects limit', async () => {
    const { pushActivityEntry, getRecentActivity } = await import('./events.js')
    pushActivityEntry('e1', 'one')
    pushActivityEntry('e2', 'two')
    expect(getRecentActivity(1).length).toBe(1)
  })

  it('emitHeartbeat adds activity entry', async () => {
    const { emitHeartbeat, getRecentActivity } = await import('./events.js')
    emitHeartbeat('ok')
    const recent = getRecentActivity(5)
    const hb = recent.find(e => e.event === 'heartbeat_tick')
    expect(hb).toBeTruthy()
    expect(hb!.summary).toContain('ok')
  })
})
