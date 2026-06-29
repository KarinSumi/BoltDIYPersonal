export class ThreadManager {
  constructor(options = {}) {
    this.threads = new Map()
  }

  create(agentId, initialMessages = []) {
    const threadId = `thread-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const thread = {
      id: threadId,
      agentId,
      messages: [...initialMessages],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: null,
      compactCount: 0,
    }
    this.threads.set(threadId, thread)
    return thread
  }

  get(threadId) {
    return this.threads.get(threadId) || null
  }

  append(threadId, message) {
    const thread = this.threads.get(threadId)
    if (!thread) return null
    thread.messages.push(message)
    thread.updatedAt = Date.now()
    return thread
  }

  rotate(threadId, summary) {
    const oldThread = this.threads.get(threadId)
    if (!oldThread) return null

    const compactCount = (oldThread.compactCount || 0) + 1
    const newId = `${oldThread.agentId}-c${compactCount}-${Date.now().toString(36)}`

    const newThread = {
      id: newId,
      agentId: oldThread.agentId,
      messages: [
        ...(summary ? [{ role: 'system', content: `[Previous conversation summary]: ${summary}` }] : []),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: threadId,
      compactCount,
    }

    this.threads.set(newId, newThread)
    return newThread
  }

  /**
   * Before each turn, check if compaction is needed.
   * If so, summarize, rotate thread, and return the new thread.
   */
  async beforeTurn(threadId, modelId, summarizeFn) {
    const thread = this.threads.get(threadId)
    if (!thread) return { thread: null, compacted: false }

    const check = needsCompact(thread.messages, modelId)
    if (!check.needed) return { thread, compacted: false }

    const result = await compact(threadId, thread.messages, modelId, summarizeFn)
    const newThread = this.rotate(threadId, result.summary)
    return { thread: newThread, compacted: true, summary: result.summary }
  }

  list(agentId) {
    const results = []
    for (const [, thread] of this.threads) {
      if (thread.agentId === agentId) results.push(thread)
    }
    return results.sort((a, b) => a.createdAt - b.createdAt)
  }

  delete(threadId) {
    return this.threads.delete(threadId)
  }
}

export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

const CONTEXT_WINDOWS = {
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gemini-2.0-flash': 1048576,
  'gemini-2.0-pro': 1048576,
  'deepseek-chat': 65536,
  'deepseek-reasoner': 65536,
}

export function getContextWindow(modelId) {
  return CONTEXT_WINDOWS[modelId] || 128000
}

export function needsCompact(messages, modelId) {
  const contextWindow = getContextWindow(modelId)
  const threshold = contextWindow * 0.8
  const totalTokens = messages.reduce((sum, m) => {
    return sum + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
  }, 0)
  return { needed: totalTokens > threshold, totalTokens, contextWindow, threshold }
}

export async function compact(threadId, messages, modelId, summarizeFn) {
  const contextWindow = getContextWindow(modelId)
  const maxResponseTokens = 4096
  const availableForMessages = contextWindow - maxResponseTokens

  let totalTokens = 0
  const preserved = []
  const toSummarize = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(typeof messages[i].content === 'string' ? messages[i].content : JSON.stringify(messages[i].content))
    if (totalTokens + tokens < availableForMessages * 0.6) {
      preserved.unshift(messages[i])
      totalTokens += tokens
    } else {
      toSummarize.unshift(messages[i])
    }
  }

  let summary = ''
  if (toSummarize.length > 0 && summarizeFn) {
    const transcript = toSummarize.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : '[complex]'}`).join('\n')
    summary = await summarizeFn(`Summarize this conversation concisely, preserving all key facts, decisions, and context:\n\n${transcript}`)
  }

  return {
    summary,
    threadId: threadId + '-c' + Date.now(),
    messages: [
      ...(summary ? [{ role: 'system', content: `[Previous conversation summary]: ${summary}` }] : []),
      ...preserved,
    ],
    compacted: toSummarize.length > 0,
  }
}

export function handleBackendError(error) {
  const errStr = (error?.message || error?.toString() || '').toLowerCase()

  if (errStr.includes('429') || errStr.includes('rate limit')) {
    return { action: 'retry', delay: 5000, message: 'Rate limited, retrying in 5s' }
  }

  if (errStr.includes('context_length') || errStr.includes('too large') || errStr.includes('maximum context')) {
    return { action: 'compact', message: 'Context limit exceeded, compacting' }
  }

  if (errStr.includes('timeout') || errStr.includes('timed out')) {
    return { action: 'retry', delay: 2000, message: 'Timeout, retrying in 2s' }
  }

  return { action: 'fail', message: error?.message || 'Unknown error' }
}

export class ContextManager {
  constructor(options = {}) {
    this.providers = options.providers
    this.threadManager = new ThreadManager()
  }

  estimateTokens(text) {
    return estimateTokens(text)
  }

  getContextWindow(modelId) {
    return getContextWindow(modelId)
  }

  needsCompact(messages, modelId) {
    return needsCompact(messages, modelId)
  }

  async compact(threadId, messages, modelId, summarizeFn) {
    return compact(threadId, messages, modelId, summarizeFn)
  }

  handleBackendError(error, messages, modelId) {
    return handleBackendError(error)
  }
}
