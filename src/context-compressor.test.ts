import { describe, it, expect } from 'vitest'
import { compressContext } from './context-compressor.js'
import type { AgentMessage } from './opencode-agent.js'

function msg(content: string): AgentMessage {
  return { role: 'user', content }
}

function longMsg(length: number): AgentMessage {
  return msg('x'.repeat(length))
}

describe('compressContext', () => {
  it('returns messages unchanged if under 75% threshold', () => {
    const messages = [msg('hello'), msg('world')]
    const result = compressContext(messages, 4000)
    expect(result).toEqual(messages)
  })

  it('returns messages unchanged for empty array', () => {
    const result = compressContext([], 4000)
    expect(result).toEqual([])
  })

  it('compresses old messages when total exceeds threshold', () => {
    const messages = [longMsg(2000), longMsg(2000)]
    const result = compressContext(messages, 100)
    expect(result.length).toBe(2)
    expect(result[0].content.length).toBeLessThan(2000)
  })

  it('preserves the most recent 20% of messages from compression', () => {
    const messages = Array.from({ length: 10 }, (_, i) => longMsg(1000))
    const result = compressContext(messages, 500)
    const preserveCount = Math.max(1, Math.ceil(10 * 0.20))
    const protectedIndex = Math.max(0, 10 - preserveCount)
    for (let i = protectedIndex; i < 10; i++) {
      expect(result[i].content.length).toBe(1000)
    }
  })

  it('handles single message with empty content', () => {
    const messages = [msg('')]
    const result = compressContext(messages, 100)
    expect(result[0].content).toBe('')
  })

  it('does not compress messages under 50 tokens', () => {
    const messages = [msg('short'), longMsg(3000)]
    const result = compressContext(messages, 100)
    expect(result[0].content).toBe('short')
  })

  it('compresses messages with content over 400 chars', () => {
    const messages = [longMsg(1500), longMsg(1500)]
    const result = compressContext(messages, 100)
    expect(result[0].content).toContain('characters compressed by OpenCode OS ContextCompressor')
  })

  it('returns messages as-is when maxTokens is 0', () => {
    const messages = [msg('hi')]
    const result = compressContext(messages, 0)
    expect(result).toEqual(messages)
  })
})
