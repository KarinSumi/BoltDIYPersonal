import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProviderRouter } from './provider-router.js'

describe('ProviderRouter', () => {
  let registry

  beforeEach(() => {
    registry = {
      get: vi.fn(),
    }
  })

  it('returns default Claude for unknown agent', () => {
    registry.get.mockReturnValue(null)
    const router = new ProviderRouter({ registry })
    const route = router.getRoute('unknown')
    expect(route.provider.id).toBe('anthropic')
    expect(route.model).toBe('claude-3-5-sonnet-20241022')
  })

  it('routes to the agent configured model', () => {
    registry.get.mockReturnValue({ id: 'researcher', model: 'deepseek-chat', name: 'Researcher' })
    const router = new ProviderRouter({ registry })
    const route = router.getRoute('researcher')
    expect(route.provider.id).toBe('deepseek')
    expect(route.model).toBe('deepseek-chat')
  })

  it('builds request config with api key from env', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key'
    registry.get.mockReturnValue({ id: 'coder', model: 'gpt-4o', name: 'Coder' })
    const router = new ProviderRouter({ registry })
    const config = router.getRequestConfig('coder')
    expect(config.baseUrl).toBe('https://api.openai.com')
    expect(config.apiKey).toBe('sk-test-key')
    expect(config.format).toBe('openai')
    delete process.env.OPENAI_API_KEY
  })

  it('falls through to anthropic if model not found in any provider', () => {
    registry.get.mockReturnValue({ id: 'custom', model: 'completely-unknown-model', name: 'Custom' })
    const router = new ProviderRouter({ registry })
    const route = router.getRoute('custom')
    expect(route.provider.id).toBe('anthropic')
  })
})
