import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

let retryOnRateLimit: any, executeToolCall: any, queryAgent: any, availableTools: any

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'opencode-agent-test-'))

  vi.resetModules()
  vi.restoreAllMocks()

  vi.mock('child_process', () => ({
    exec: vi.fn((cmd, opts, cb) => {
      if (typeof opts === 'function') cb = opts
      const cbFn = cb as (err: Error | null, result: { stdout: string; stderr: string }) => void
      cbFn(null, { stdout: 'mock stdout output', stderr: '' })
    }),
    promisify: () => (cmd: string, opts: any) => Promise.resolve({ stdout: 'mock stdout output', stderr: '' }),
  }))

  vi.mock('glob', () => ({
    glob: vi.fn((pattern: string) => Promise.resolve(['file1.ts', 'file2.ts'])),
  }))

  vi.mock('googlethis', () => ({
    search: vi.fn(() => Promise.resolve({
      results: [
        { title: 'Result 1', description: 'Description 1', url: 'https://example.com/1' },
      ],
      top_news: [
        { title: 'News 1', url: 'https://news.example.com/1' },
      ],
    })),
  }))

  vi.mock('cheerio', () => ({
    load: vi.fn(() => (selector: string) => ({
      remove: vi.fn(),
      text: () => 'mocked cheerio text output',
    })),
  }))

  vi.mock('./llm-client.js', () => ({
    getClient: vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(() => Promise.resolve({
            choices: [{
              finish_reason: 'stop',
              message: { content: 'Hello! How can I help you?', role: 'assistant' },
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          })),
        },
      },
    })),
    getModel: vi.fn(() => 'deepseek-ai/deepseek-v4-flash'),
  }))

  vi.mock('./rate-limit-gate.js', () => {
    const gates = new Map<string, { cooldownUntil: number }>()
    return {
      checkGate: vi.fn((model: string) => {
        const gate = gates.get(model)
        if (gate && Date.now() < gate.cooldownUntil) {
          return { blocked: true, waitMs: gate.cooldownUntil - Date.now() }
        }
        return { blocked: false, waitMs: 0 }
      }),
      tripGate: vi.fn((model: string, retryAfterMs: number) => {
        gates.set(model, { cooldownUntil: Date.now() + retryAfterMs })
      }),
      resetGate: vi.fn((model?: string) => {
        if (model) gates.delete(model)
        else gates.clear()
      }),
      isGateTripped: vi.fn(() => false),
      getRetryAfterMs: vi.fn(() => 0),
    }
  })

  vi.mock('./context-compressor.js', () => ({
    compressContext: vi.fn((messages: any[], _maxTokens?: number) => messages),
  }))

  vi.mock('./config.js', async () => {
    const actual = await vi.importActual<typeof import('./config.js')>('./config.js')
    return {
      ...actual,
      STORE_DIR: tmpDir,
      AGENT_MAX_TURNS: 5,
    }
  })

  vi.mock('./logger.js', () => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }))

  vi.mock('./errors.js', () => ({
    classifyError: vi.fn(() => ({
      category: 'unknown',
      recovery: { shouldRetry: false, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 0, userMessage: 'Error' },
    })),
  }))

  const mod = await import('./opencode-agent.js')
  retryOnRateLimit = mod.retryOnRateLimit
  executeToolCall = mod.executeToolCall
  queryAgent = mod.queryAgent
  availableTools = mod.availableTools
})

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('retryOnRateLimit', () => {
  it('calls the function with the initial model and returns result', async () => {
    const fn = vi.fn((m: string) => Promise.resolve(`done with ${m}`))
    const result = await retryOnRateLimit('initial-model', fn, 2)
    expect(result).toBe('done with initial-model')
    expect(fn).toHaveBeenCalledWith('initial-model')
  })

  it('cycles to next model on rate-limit', async () => {
    const fn = vi.fn((m: string) => {
      if (m === 'initial-model') return Promise.reject(new Error('rate limit 429'))
      return Promise.resolve(`done with ${m}`)
    })
    // Override classifyError to return rate_limit
    const { classifyError } = await import('./errors.js')
    vi.mocked(classifyError).mockReturnValue({
      category: 'rate_limit',
      recovery: { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 100, userMessage: '' },
    })

    const result = await retryOnRateLimit('initial-model', fn, 2)
    expect(result).toBe('done with openai/gpt-oss-120b')
  })

  it('throws non-rate-limit errors immediately', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('auth error 401')))
    const { classifyError } = await import('./errors.js')
    vi.mocked(classifyError).mockReturnValue({
      category: 'auth',
      recovery: { shouldRetry: false, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 0, userMessage: '' },
    })

    await expect(retryOnRateLimit('model', fn, 2)).rejects.toThrow('auth error 401')
  })

  it('waits when all models are gated and then retries', async () => {
    const fn = vi.fn((m: string) => Promise.resolve(`done with ${m}`))
    const { tripGate } = await import('./rate-limit-gate.js')
    tripGate('initial-model', 50_000)
    tripGate('openai/gpt-oss-120b', 50_000)
    tripGate('meta/llama-3.1-70b-instruct', 50_000)
    tripGate('nvidia/nemotron-3-ultra-550b-a55b', 50_000)

    const promise = retryOnRateLimit('initial-model', fn, 2, true)
    await expect(promise).rejects.toThrow('Rate limit active')
  })
})

describe('executeToolCall', () => {
  it('read_file returns file content', async () => {
    const testFile = join(tmpDir, 'test.txt')
    writeFileSync(testFile, 'hello world', 'utf-8')
    const result = await executeToolCall({
      id: '1',
      type: 'function',
      function: { name: 'read_file', arguments: JSON.stringify({ path: testFile }) },
    })
    expect(result).toBe('hello world')
  })

  it('read_file returns error for missing file', async () => {
    const result = await executeToolCall({
      id: '2',
      type: 'function',
      function: { name: 'read_file', arguments: JSON.stringify({ path: join(tmpDir, 'nonexistent.txt') }) },
    })
    expect(result).toContain('Error reading file')
  })

  it('write_file creates file and returns confirmation', async () => {
    const testFile = join(tmpDir, 'new.txt')
    const result = await executeToolCall({
      id: '3',
      type: 'function',
      function: { name: 'write_file', arguments: JSON.stringify({ path: testFile, content: 'test content' }) },
    })
    expect(result).toBe(`File written: ${testFile}`)
    expect(readFileSync(testFile, 'utf-8')).toBe('test content')
  })

  it('write_file creates parent directory if needed', async () => {
    const nestedFile = join(tmpDir, 'a', 'b', 'c', 'nested.txt')
    await executeToolCall({
      id: '4',
      type: 'function',
      function: { name: 'write_file', arguments: JSON.stringify({ path: nestedFile, content: 'nested' }) },
    })
    expect(existsSync(nestedFile)).toBe(true)
  })

  it('bash executes command and returns stdout', async () => {
    const result = await executeToolCall({
      id: '5',
      type: 'function',
      function: { name: 'bash', arguments: JSON.stringify({ command: 'echo hello' }) },
    })
    expect(result).toContain('mock stdout output')
  })

  it('glob returns matching files', async () => {
    const result = await executeToolCall({
      id: '6',
      type: 'function',
      function: { name: 'glob', arguments: JSON.stringify({ pattern: '*.ts' }) },
    })
    expect(result).toContain('file1.ts')
    expect(result).toContain('file2.ts')
  })

  it('grep returns search results', async () => {
    const result = await executeToolCall({
      id: '7',
      type: 'function',
      function: { name: 'grep', arguments: JSON.stringify({ pattern: 'test', include: '*.ts' }) },
    })
    expect(result).toBe('mock stdout output')
  })

  it('web_search returns formatted results', async () => {
    const result = await executeToolCall({
      id: '8',
      type: 'function',
      function: { name: 'web_search', arguments: JSON.stringify({ query: 'test query' }) },
    })
    expect(result).toContain('Result 1')
    expect(result).toContain('Description 1')
    expect(result).toContain('https://example.com/1')
    expect(result).toContain('News 1')
  })

  it('web_fetch fetches and strips HTML', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('<html><body>Hello World</body></html>'),
      } as any)
    )
    const result = await executeToolCall({
      id: '9',
      type: 'function',
      function: { name: 'web_fetch', arguments: JSON.stringify({ url: 'https://example.com' }) },
    })
    expect(result).toBe('mocked cheerio text output')
  })

  it('web_fetch falls back to regex stripping when cheerio fails', async () => {
    // Make cheerio.load throw
    const cheerio = await import('cheerio')
    vi.mocked(cheerio.load).mockImplementation(() => { throw new Error('cheerio fail') })

    global.fetch = vi.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('<html><body>Hello World</body></html>'),
      } as any)
    )
    const result = await executeToolCall({
      id: '10',
      type: 'function',
      function: { name: 'web_fetch', arguments: JSON.stringify({ url: 'https://example.com' }) },
    })
    expect(result).toContain('Hello World')
  })
})

describe('queryAgent', () => {
  it('returns text response from LLM', async () => {
    const result = await queryAgent({
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are a helpful assistant.',
      maxTurns: 3,
    })
    expect(result.text).toBe('Hello! How can I help you?')
  })

  it('returns the model used in the result', async () => {
    const result = await queryAgent({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTurns: 1,
    })
    expect(result.model).toBe('deepseek-ai/deepseek-v4-flash')
  })

  it('calls compressContext on messages', async () => {
    const { compressContext } = await import('./context-compressor.js')
    await queryAgent({
      messages: [{ role: 'user', content: 'Hello' }],
      maxTurns: 1,
    })
    expect(compressContext).toHaveBeenCalled()
  })

  it('throws error when failing fast', async () => {
    const { classifyError } = await import('./errors.js')
    vi.mocked(classifyError).mockReturnValue({
      category: 'rate_limit',
      recovery: { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 100, userMessage: '' },
    })
    const { tripGate } = await import('./rate-limit-gate.js')
    tripGate('deepseek-ai/deepseek-v4-flash', 60_000)
    tripGate('openai/gpt-oss-120b', 60_000)
    tripGate('meta/llama-3.1-70b-instruct', 60_000)
    tripGate('nvidia/nemotron-3-ultra-550b-a55b', 60_000)

    await expect(queryAgent({
      messages: [{ role: 'user', content: 'test' }],
      maxTurns: 1,
      failFast: true,
    })).rejects.toThrow()
  })
})
