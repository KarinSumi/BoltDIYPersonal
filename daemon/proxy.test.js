import { describe, it, expect } from 'vitest'
import { ApiProxy } from './proxy.js'

describe('ApiProxy', () => {
  const proxy = new ApiProxy()

  it('converts Anthropic format to OpenAI format', () => {
    const anthropicReq = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
      system: 'Be helpful',
      max_tokens: 4096,
      temperature: 0.7,
    }

    const result = proxy.anthropicToOpenAI(anthropicReq)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toBe('Be helpful')
    expect(result.messages[1].content).toBe('Hello')
    expect(result.messages[2].content).toBe('Hi there')
    expect(result.max_tokens).toBe(4096)
  })

  it('converts OpenAI format to Anthropic format', () => {
    const openAIReq = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ],
    }

    const result = proxy.openAIToAnthropic(openAIReq)
    expect(result.system).toBe('You are helpful')
    expect(result.messages[0].content).toBe('Hi')
    expect(result.messages[1].content).toBe('Hello')
  })

  it('handles streaming chunk transformation (OpenAI->Anthropic)', () => {
    const chunk = JSON.stringify({ choices: [{ delta: { content: 'Hello' }, index: 0 }] })
    const result = proxy.transformOpenAIStreamChunk(chunk)
    expect(result.type).toBe('content_block_delta')
    expect(result.delta.text).toBe('Hello')
  })

  it('handles streaming chunk transformation (Anthropic->OpenAI)', () => {
    const chunk = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } })
    const result = proxy.transformAnthropicStreamChunk(chunk)
    expect(result).toContain('World')
  })

  it('handles finish reason in streaming', () => {
    const chunk = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })
    const result = proxy.transformOpenAIStreamChunk(chunk)
    expect(result.type).toBe('message_stop')
  })

  it('handles empty messages', () => {
    const result = proxy.anthropicToOpenAI({ messages: [] })
    expect(result.messages).toEqual([])
  })
})
