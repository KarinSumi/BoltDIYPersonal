import { getProvider, getProviderByModel } from './providers.js'

export class ProviderRouter {
  constructor(options = {}) {
    this.registry = options.registry
  }

  getRoute(agentId) {
    const agent = this.registry.get(agentId)
    if (!agent) {
      return { provider: getProvider('anthropic'), model: 'claude-3-5-sonnet-20241022' }
    }

    const modelId = agent.model || 'claude-3-5-sonnet-20241022'
    let provider = getProviderByModel(modelId)

    if (!provider) {
      provider = getProvider('anthropic')
    }

    return { provider, model: modelId }
  }

  getRequestConfig(agentId, additionalConfig = {}) {
    const route = this.getRoute(agentId)
    const provider = route.provider

    let apiKey = ''
    if (provider.apiKeyEnv) {
      apiKey = process.env[provider.apiKeyEnv] || ''
    }

    return {
      baseUrl: provider.baseUrl,
      apiKey,
      model: route.model,
      format: provider.format,
      ...additionalConfig,
    }
  }
}
