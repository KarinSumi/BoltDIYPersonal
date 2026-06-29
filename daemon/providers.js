export const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    format: 'anthropic',
    local: false,
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com',
    apiKeyEnv: 'OPENAI_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-mini',
    ],
    defaultModel: 'gpt-4o',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyEnv: 'GOOGLE_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'gemini-2.0-flash',
      'gemini-2.0-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'openrouter/auto',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-2.0-flash',
      'meta-llama/llama-3.1-405b',
    ],
    defaultModel: 'openrouter/auto',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    apiKeyEnv: 'GROQ_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'cerebras-llama-3.3-70b',
    ],
    defaultModel: 'cerebras-llama-3.3-70b',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai',
    apiKeyEnv: 'XAI_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'grok-2',
      'grok-2-mini',
    ],
    defaultModel: 'grok-2',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai',
    apiKeyEnv: 'MISTRAL_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-small-latest',
      'codestral-latest',
    ],
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz',
    apiKeyEnv: 'TOGETHER_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'together-gpt-4o',
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      'mistralai/Mixtral-8x22B-Instruct-v0.1',
    ],
    defaultModel: 'together-gpt-4o',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference',
    apiKeyEnv: 'FIREWORKS_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/llama-v3p1-405b-instruct',
    ],
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://api.nvcf.nvidia.com/v2/nvcf',
    apiKeyEnv: 'NVIDIA_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'llama-3.1-70b-instruct',
      'llama-3.1-405b-instruct',
    ],
    defaultModel: 'llama-3.1-70b-instruct',
  },
  {
    id: 'glm',
    name: 'GLM (Zhipu)',
    baseUrl: 'https://open.bigmodel.cn/api/paas',
    apiKeyEnv: 'GLM_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'glm-4-plus',
      'glm-4-air',
      'glm-4-flash',
    ],
    defaultModel: 'glm-4-plus',
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    apiKeyEnv: 'QWEN_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen2.5-72b-instruct',
    ],
    defaultModel: 'qwen-max',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat',
    apiKeyEnv: 'MINIMAX_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'minimax-text-01',
      'minimax-abab-6.5',
    ],
    defaultModel: 'minimax-text-01',
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn',
    apiKeyEnv: 'KIMI_API_KEY',
    format: 'openai',
    local: false,
    models: [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
    ],
    defaultModel: 'moonshot-v1-128k',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://127.0.0.1:11434',
    apiKeyEnv: null,
    format: 'openai',
    local: true,
    models: [],
    defaultModel: 'llama3.2',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    baseUrl: 'http://127.0.0.1:1234',
    apiKeyEnv: null,
    format: 'openai',
    local: true,
    models: [],
    defaultModel: 'local-model',
  },
]

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || null
}

export function getProviderByModel(modelId) {
  for (const p of PROVIDERS) {
    if (p.models.includes(modelId)) return p
    if (p.defaultModel === modelId) return p
  }
  return getProvider('anthropic')
}

export async function fetchLocalModels(providerId) {
  const provider = getProvider(providerId)
  if (!provider || !provider.local) return []

  try {
    const response = await fetch(`${provider.baseUrl}/v1/models`)
    if (response.ok) {
      const data = await response.json()
      provider.models = (data.data || []).map(m => m.id || m)
      return provider.models
    }
  } catch {}
  return provider.models
}
