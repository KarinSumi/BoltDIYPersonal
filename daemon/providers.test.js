import { describe, it, expect } from 'vitest'
import { getProvider, getProviderByModel, PROVIDERS } from './providers.js'

describe('Providers', () => {
  it('returns 18 providers', () => {
    expect(PROVIDERS.length).toBe(18)
  })

  it('finds provider by id', () => {
    const p = getProvider('openai')
    expect(p).not.toBeNull()
    expect(p.name).toBe('OpenAI (GPT)')
    expect(p.baseUrl).toBe('https://api.openai.com')
  })

  it('returns null for unknown provider', () => {
    expect(getProvider('nonexistent')).toBeNull()
  })

  it('finds provider by model', () => {
    const p = getProviderByModel('gpt-4o')
    expect(p.id).toBe('openai')
  })

  it('finds provider by default model', () => {
    const p = getProviderByModel('deepseek-chat')
    expect(p.id).toBe('deepseek')
  })

  it('falls back to anthropic for unknown model', () => {
    const p = getProviderByModel('unknown-model-xyz')
    expect(p.id).toBe('anthropic')
  })

  it('local providers have null apiKeyEnv', () => {
    const ollama = getProvider('ollama')
    expect(ollama.apiKeyEnv).toBeNull()
    expect(ollama.local).toBe(true)
  })

  it('each provider has required fields', () => {
    for (const p of PROVIDERS) {
      expect(p.id).toBeDefined()
      expect(p.name).toBeDefined()
      expect(p.baseUrl).toBeDefined()
      expect(p.format).toMatch(/^(openai|anthropic)$/)
      expect(Array.isArray(p.models)).toBe(true)
    }
  })
})
