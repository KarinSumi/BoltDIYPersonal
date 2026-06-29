import { describe, it, expect, vi } from 'vitest'
import { PluginContext } from './plugin-ctx.js'

describe('PluginContext (ctx)', () => {
  it('provides registry access', () => {
    const mockRegistry = {
      list: () => [{ id: 'alice', name: 'Alice' }],
      get: (id) => ({ id, name: 'Test' }),
    }
    const ctx = new PluginContext({ registry: mockRegistry })
    expect(ctx.registry.list()).toHaveLength(1)
    expect(ctx.registry.get('bob').name).toBe('Test')
  })

  it('broadcasts events', () => {
    const broadcast = vi.fn()
    const ctx = new PluginContext({ broadcast })
    ctx.broadcast('plugin_event', { msg: 'hello' })
    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0]
    expect(event.type).toBe('plugin_event')
    expect(event.data.msg).toBe('hello')
    expect(event.source).toBe('plugin')
    expect(event.ts).toBeDefined()
  })

  it('subscribes to events via feed and dispatches', () => {
    const ctx = new PluginContext()
    const callback = vi.fn()
    ctx.feed('agent_update', callback)

    ctx.dispatchEvent({
      type: 'agent_update',
      data: { agentId: 'alice', status: 'WORKING' },
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(
      { agentId: 'alice', status: 'WORKING' },
      expect.objectContaining({ type: 'agent_update' }),
    )
  })

  it('does not fire callback for unsubscribed event type', () => {
    const ctx = new PluginContext()
    const callback = vi.fn()
    ctx.feed('agent_update', callback)
    ctx.dispatchEvent({ type: 'unrelated_event', data: {} })
    expect(callback).not.toHaveBeenCalled()
  })

  it('supports wildcard feed (*)', () => {
    const ctx = new PluginContext()
    const wildcard = vi.fn()
    ctx.feed('*', wildcard)
    ctx.dispatchEvent({ type: 'any_event', data: { x: 1 } })
    expect(wildcard).toHaveBeenCalledTimes(1)
  })

  it('returns a disposer that unsubscribes', () => {
    const ctx = new PluginContext()
    const callback = vi.fn()
    const dispose = ctx.feed('test', callback)
    dispose()
    ctx.dispatchEvent({ type: 'test', data: {} })
    expect(callback).not.toHaveBeenCalled()
  })

  it('provides key-value storage', () => {
    const ctx = new PluginContext()
    ctx.storage.set('key1', 'value1')
    ctx.storage.set('key2', 42)
    expect(ctx.storage.get('key1')).toBe('value1')
    expect(ctx.storage.get('key2')).toBe(42)
    expect(ctx.storage.keys()).toEqual(['key1', 'key2'])
    ctx.storage.delete('key1')
    expect(ctx.storage.get('key1')).toBeUndefined()
    ctx.storage.clear()
    expect(ctx.storage.keys()).toEqual([])
  })

  it('runClaude calls the LLM function', async () => {
    const llm = vi.fn().mockResolvedValue('LLM response')
    const ctx = new PluginContext({ llm })
    const result = await ctx.runClaude('Hello')
    expect(result).toBe('LLM response')
    expect(llm).toHaveBeenCalledWith('Hello', {})
  })

  it('runClaude throws when no LLM configured', async () => {
    const ctx = new PluginContext()
    await expect(ctx.runClaude('test')).rejects.toThrow('No LLM function configured')
  })

  it('returns empty registry when none configured', () => {
    const ctx = new PluginContext()
    expect(ctx.registry.list()).toEqual([])
    expect(ctx.registry.get('any')).toBeNull()
  })
})
