export class ApiProxy {
  constructor(options = {}) {
    this.debug = options.debug || false
  }

  anthropicToOpenAI(anthropicRequest) {
    const messages = anthropicRequest.messages || []
    const system = anthropicRequest.system || ''

    const mapped = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).map(block => {
            if (block.type === 'text') return { type: 'text', text: block.text }
            if (block.type === 'image') return { type: 'image_url', image_url: { url: block.source?.data || '' } }
            if (block.type === 'tool_use') return { type: 'tool_call', ...block }
            if (block.type === 'tool_result') return { type: 'tool_result', ...block }
            return block
          })
    }))

    const result = {
      model: anthropicRequest.model || 'gpt-4',
      messages: mapped,
      max_tokens: anthropicRequest.max_tokens || 4096,
      temperature: anthropicRequest.temperature ?? 0.7,
      stream: anthropicRequest.stream ?? false,
    }

    if (system) {
      result.messages.unshift({ role: 'system', content: system })
    }

    return result
  }

  openAIToAnthropic(openAIRequest) {
    const messages = openAIRequest.messages || []

    let system = ''
    const filtered = messages.filter(msg => {
      if (msg.role === 'system') {
        system = msg.content
        return false
      }
      return true
    })

    const mapped = filtered.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).map(part => {
            if (part.type === 'text') return { type: 'text', text: part.text }
            if (part.type === 'image_url') return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: part.image_url?.url || '' } }
            return part
          })
    }))

    return {
      model: openAIRequest.model || 'claude-3-5-sonnet-20241022',
      messages: mapped,
      system: system || undefined,
      max_tokens: openAIRequest.max_tokens || 4096,
      temperature: openAIRequest.temperature ?? 0.7,
      stream: openAIRequest.stream ?? false,
    }
  }

  transformOpenAIStreamChunk(chunk) {
    try {
      const parsed = JSON.parse(chunk)
      if (parsed.choices?.[0]?.delta?.content) {
        return {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: parsed.choices[0].delta.content
          }
        }
      }
      if (parsed.choices?.[0]?.finish_reason) {
        return { type: 'message_stop' }
      }
    } catch {}
    return null
  }

  transformAnthropicStreamChunk(chunk) {
    try {
      const parsed = JSON.parse(chunk)
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        return JSON.stringify({
          choices: [{ delta: { content: parsed.delta.text }, index: 0 }]
        }) + '\n'
      }
      if (parsed.type === 'message_stop') {
        return JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }]
        }) + '\n'
      }
    } catch {}
    return null
  }

  async relay(providerConfig, request, format) {
    const isAnthropic = format === 'anthropic'
    const targetRequest = isAnthropic
      ? this.anthropicToOpenAI(request)
      : this.openAIToAnthropic(request)

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${providerConfig.apiKey || ''}`,
    }

    if (this.debug) {
      console.log('[Proxy]', JSON.stringify({ targetRequest, targetUrl: providerConfig.baseUrl }))
    }

    const response = await fetch(`${providerConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(targetRequest),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Provider error ${response.status}: ${errorText}`)
    }

    if (request.stream) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      return new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
            for (const line of lines) {
              const chunk = line.slice(6)
              const transformed = isAnthropic
                ? null
                : chunk
              if (transformed) {
                controller.enqueue(new TextEncoder().encode(transformed + '\n'))
              }
            }
          }
          controller.close()
        }
      })
    }

    const data = await response.json()
    if (isAnthropic) {
      return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model,
        role: 'assistant',
      }
    }
    return data
  }
}
