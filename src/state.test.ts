import { describe, it, expect, beforeEach } from 'vitest'

describe('state', () => {
  beforeEach(async () => {
    const { activeSessions, abortControllers, voiceEnabledChats } =
      await import('./state.js')
    activeSessions.clear()
    abortControllers.clear()
    voiceEnabledChats.clear()
  })

  it('tracks last activity time via touchActivity', async () => {
    const { touchActivity, lastActivityAt } = await import('./state.js')
    const before = lastActivityAt
    await new Promise((r) => setTimeout(r, 5))
    touchActivity()
    const { lastActivityAt: after } = await import('./state.js')
    expect(after).toBeGreaterThan(before)
  })

  it('setLocked changes isSystemLocked', async () => {
    const { setLocked, isSystemLocked } = await import('./state.js')
    const original = isSystemLocked
    setLocked(!original)
    const { isSystemLocked: updated } = await import('./state.js')
    expect(updated).toBe(!original)
    setLocked(original)
  })

  it('manages activeSessions', async () => {
    const { activeSessions } = await import('./state.js')
    activeSessions.set('chat-1', { startedAt: Date.now(), agentId: 'agent-a' })
    expect(activeSessions.has('chat-1')).toBe(true)
    expect(activeSessions.get('chat-1')!.agentId).toBe('agent-a')
  })

  it('manages voiceEnabledChats', async () => {
    const { voiceEnabledChats } = await import('./state.js')
    voiceEnabledChats.add('chat-v')
    expect(voiceEnabledChats.has('chat-v')).toBe(true)
  })

  it('manages abortControllers', async () => {
    const { abortControllers } = await import('./state.js')
    const ac = new AbortController()
    abortControllers.set('task-1', ac)
    expect(abortControllers.get('task-1')).toBe(ac)
  })

  it('exports chatEvents as EventEmitter', async () => {
    const { chatEvents } = await import('./state.js')
    expect(typeof chatEvents.on).toBe('function')
    expect(typeof chatEvents.emit).toBe('function')
  })
})
