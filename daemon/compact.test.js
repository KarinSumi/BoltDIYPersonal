import { describe, it, expect } from 'vitest'
import { ContextManager, ThreadManager, estimateTokens, getContextWindow, needsCompact, compact, handleBackendError } from './compact.js'

describe('ContextManager (legacy API)', () => {
  const cm = new ContextManager()

  it('estimates tokens', () => {
    expect(cm.estimateTokens('hello world')).toBe(3)
    expect(cm.estimateTokens('')).toBe(0)
  })

  it('gets context window for known models', () => {
    expect(cm.getContextWindow('gpt-4o')).toBe(128000)
    expect(cm.getContextWindow('claude-3-5-sonnet-20241022')).toBe(200000)
    expect(cm.getContextWindow('gemini-2.0-flash')).toBe(1048576)
  })

  it('returns default for unknown models', () => {
    expect(cm.getContextWindow('unknown-model')).toBe(128000)
  })

  it('detects when compaction is needed', () => {
    const longMsg = { role: 'user', content: 'A'.repeat(250000) }
    const midMsg = { role: 'assistant', content: 'B'.repeat(250000) }
    const result = cm.needsCompact([longMsg, midMsg], 'gpt-4o')
    expect(result.needed).toBe(true)
    expect(result.totalTokens).toBeGreaterThan(result.threshold)
  })

  it('detects when compaction is not needed', () => {
    const msgs = [{ role: 'user', content: 'Hello' }]
    const result = cm.needsCompact(msgs, 'gpt-4o')
    expect(result.needed).toBe(false)
  })

  it('handles backend errors correctly', () => {
    expect(cm.handleBackendError(new Error('429 Too Many Requests'), [], 'gpt-4o').action).toBe('retry')
    expect(cm.handleBackendError(new Error('context_length_exceeded'), [], 'gpt-4o').action).toBe('compact')
    expect(cm.handleBackendError(new Error('timeout'), [], 'gpt-4o').action).toBe('retry')
    expect(cm.handleBackendError(new Error('random error'), [], 'gpt-4o').action).toBe('fail')
  })
})

describe('ThreadManager — Auto-New-Thread', () => {
  it('creates a thread for an agent', () => {
    const tm = new ThreadManager()
    const thread = tm.create('alice', [{ role: 'user', content: 'Hello' }])
    expect(thread.id).toContain('thread-alice')
    expect(thread.agentId).toBe('alice')
    expect(thread.messages).toHaveLength(1)
    expect(thread.compactCount).toBe(0)
  })

  it('appends messages to a thread', () => {
    const tm = new ThreadManager()
    const thread = tm.create('bob')
    tm.append(thread.id, { role: 'user', content: 'Hi' })
    expect(tm.get(thread.id).messages).toHaveLength(1)
  })

  it('rotates to a new thread with summary', () => {
    const tm = new ThreadManager()
    const old = tm.create('carol', [
      { role: 'user', content: 'Tell me a story' },
      { role: 'assistant', content: 'Once upon a time...' },
    ])
    expect(old.compactCount).toBe(0)

    const newThread = tm.rotate(old.id, 'Carol asked for a story about a fairy tale.')
    expect(newThread).not.toBeNull()
    expect(newThread.id).not.toBe(old.id)
    expect(newThread.compactCount).toBe(1)
    expect(newThread.parentId).toBe(old.id)
    expect(newThread.messages[0].role).toBe('system')
    expect(newThread.messages[0].content).toContain('Carol asked')
  })

  it('beforeTurn compacts when context is near full', async () => {
    const tm = new ThreadManager()
    const bigContent = 'X'.repeat(110000)
    const thread = tm.create('dave', [
      { role: 'user', content: bigContent },
      { role: 'assistant', content: bigContent },
      { role: 'user', content: bigContent },
      { role: 'assistant', content: bigContent },
      { role: 'user', content: bigContent },
    ])

    let summarizeCalled = false
    const result = await tm.beforeTurn(thread.id, 'gpt-4o', async (prompt) => {
      summarizeCalled = true
      return 'Summary of the long conversation.'
    })

    expect(result.compacted).toBe(true)
    expect(result.summary).toBeTruthy()
    expect(result.thread.id).not.toBe(thread.id)
    expect(result.thread.messages[0].content).toContain('Summary')
    expect(summarizeCalled).toBe(true)
  })

  it('beforeTurn does nothing when context is fine', async () => {
    const tm = new ThreadManager()
    const thread = tm.create('eve', [{ role: 'user', content: 'Hello' }])

    const result = await tm.beforeTurn(thread.id, 'gpt-4o', async () => 'should not be called')
    expect(result.compacted).toBe(false)
    expect(result.thread.id).toBe(thread.id)
  })

  it('lists all threads for an agent sorted by creation time', () => {
    const tm = new ThreadManager()
    const t1 = tm.create('frank')
    const t2 = tm.create('frank')
    const t3 = tm.create('grace')

    const frankThreads = tm.list('frank')
    expect(frankThreads).toHaveLength(2)
    expect(frankThreads[0].id).toBe(t1.id)
    expect(frankThreads[1].id).toBe(t2.id)
  })

  it('deletes a thread', () => {
    const tm = new ThreadManager()
    const thread = tm.create('grace')
    expect(tm.delete(thread.id)).toBe(true)
    expect(tm.get(thread.id)).toBeNull()
  })
})

describe('Standalone exports', () => {
  it('estimateTokens works', () => {
    expect(estimateTokens('test')).toBe(1)
  })

  it('getContextWindow works', () => {
    expect(getContextWindow('deepseek-chat')).toBe(65536)
  })

  it('needsCompact works', () => {
    const result = needsCompact([{ role: 'user', content: 'A'.repeat(500000) }], 'gpt-4o')
    expect(result.needed).toBe(true)
  })

  it('compact creates summary', async () => {
    const result = await compact('thread-1', [
      { role: 'user', content: 'A'.repeat(100000) },
      { role: 'assistant', content: 'B'.repeat(100000) },
      { role: 'user', content: 'C'.repeat(100000) },
    ], 'gpt-4o', async (prompt) => 'Summary: AI discussion.')
    expect(result.compacted).toBe(true)
    expect(result.summary).toContain('AI')
  })

  it('handleBackendError works', () => {
    expect(handleBackendError(new Error('429')).action).toBe('retry')
    expect(handleBackendError(new Error('random')).action).toBe('fail')
  })
})
