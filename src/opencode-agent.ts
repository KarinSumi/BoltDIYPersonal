import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { dirname } from 'path'
import { glob } from 'glob'
import { getClient, getModel } from './llm-client.js'
import { AGENT_MAX_TURNS } from './config.js'
import { classifyError } from './errors.js'
import { checkGate, tripGate } from './rate-limit-gate.js'
import { logger } from './logger.js'
import type OpenAI from 'openai'
export type { OpenAI }

const asyncExec = promisify(exec)

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentOptions {
  messages: AgentMessage[]
  sessionId?: string
  agentId?: string
  systemPrompt?: string
  onTyping?: () => void
  maxTurns?: number
  signal?: AbortSignal
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
  failFast?: boolean
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AgentResult {
  text: string | null
  inputTokens?: number
  outputTokens?: number
  model?: string
}

export const availableTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          workdir: { type: 'string', description: 'Working directory (optional)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents with regex',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          include: { type: 'string', description: 'File pattern filter (optional)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read content from a URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' }
        },
        required: ['url']
      }
    }
  }
]

export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments)

  switch (toolCall.function.name) {
    case 'read_file': {
      try {
        const content = await readFile(args.path, 'utf-8')
        return content.slice(0, 50000)
      } catch (e: unknown) {
        return `Error reading file: ${(e as Error).message}`
      }
    }
    case 'write_file': {
      try {
        const dir = dirname(args.path)
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        await writeFile(args.path, args.content, 'utf-8')
        return `File written: ${args.path}`
      } catch (e: unknown) {
        return `Error writing file: ${(e as Error).message}`
      }
    }
    case 'bash': {
      try {
        const isWindows = process.platform === 'win32'
        const shell = isWindows ? 'powershell.exe' : '/bin/bash'
        const cmd = isWindows ? `${args.command} 2>&1` : args.command
        const opts: Record<string, unknown> = {
          maxBuffer: 2 * 1024 * 1024,
          timeout: 30000,
          shell,
        }
        if (args.workdir) opts.cwd = args.workdir
        const { stdout } = await asyncExec(cmd, opts)
        return stdout.slice(0, 50000)
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string }
        return (err.stderr || err.stdout || (e as Error).message).slice(0, 10000)
      }
    }
    case 'glob': {
      try {
        const files = await glob(args.pattern, { dot: true })
        return files.join('\n').slice(0, 10000) || 'No matches'
      } catch {
        return 'Error: invalid glob pattern'
      }
    }
    case 'grep': {
      try {
        const isWindows = process.platform === 'win32'
        const escaped = args.pattern.replace(/"/g, '\\"')
        const includeFlag = args.include ? ` -g "${args.include.replace(/"/g, '\\"')}"` : ''
        const opts = { maxBuffer: 2 * 1024 * 1024, timeout: 15000 }
        if (isWindows) {
          const cmd = `findstr /s /n /r "${escaped}" *.* 2>$null`
          const { stdout } = await asyncExec(cmd, { ...opts, shell: 'powershell.exe' })
          return stdout.slice(0, 50000) || 'No matches found'
        }
        const cmd = `rg --no-heading -n "${escaped}"${includeFlag} 2>/dev/null || true`
        const { stdout } = await asyncExec(cmd, { ...opts, shell: '/bin/bash' })
        return stdout.slice(0, 50000) || 'No matches found'
      } catch {
        return 'No matches found'
      }
    }
    case 'web_search': {
      try {
        const google = await import('googlethis')
        const results = await google.search(args.query, {
          page: 0,
          safe: false,
          parse_ads: false,
          additional_params: { hl: 'en' }
        }) as any
        
        let output = ''
        if (results.results && results.results.length > 0) {
          output += results.results.slice(0, 10).map((r: any) => `${r.title}\n${r.description}\nURL: ${r.url}`).join('\n\n')
        } else {
          output += 'No organic results.\n'
        }
        
        if (results.top_news && results.top_news.length > 0) {
          output += '\n\n--- Top News ---\n'
          output += results.top_news.map((n: any) => `${n.title}\nURL: ${n.url}`).join('\n\n')
        }
        
        return output.slice(0, 50000) || 'No results'
      } catch (e: unknown) {
        return `Search error: ${(e as Error).message}`
      }
    }
    case 'web_fetch': {
      try {
        const resp = await fetch(args.url, { headers: { 'User-Agent': 'OpenCode-OS/1.0' } })
        const text = await resp.text()
        try {
          const cheerio = await import('cheerio')
          const $ = cheerio.load(text)
          // Strip unwanted tags
          $('script, style, noscript, iframe, svg, img, video, audio').remove()
          // Extract text and collapse whitespace
          const cleanText = $('body').text().replace(/\s+/g, ' ').trim()
          return cleanText.slice(0, 50000)
        } catch (e) {
          // Fallback if cheerio fails
          return text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').slice(0, 50000)
        }
      } catch (e: unknown) {
        return `Fetch error: ${(e as Error).message}`
      }
    }
    default:
      return `Unknown tool: ${toolCall.function.name}`
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractRetryAfter(err: unknown): number {
  const apiErr = err as { status?: number; headers?: Record<string, string>; message?: string }
  if (apiErr.headers?.['retry-after']) {
    const seconds = parseInt(apiErr.headers['retry-after'], 10)
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000
  }
  return 0
}

export async function retryOnRateLimit<T>(
  initialModel: string,
  fn: (activeModel: string) => Promise<T>,
  maxRetries = 2,
  failFast = false
): Promise<T> {
  const modelQueue = [
    initialModel,
    'openai/gpt-oss-120b',
    'meta/llama-3.1-70b-instruct',
    'nvidia/nemotron-3-ultra-550b-a55b'
  ];
  // Remove duplicates while keeping order
  const uniqueModels = [...new Set(modelQueue)];
  
  let currentModelIndex = 0;
  
  for (let attempt = 0; ; attempt++) {
    let currentModel = uniqueModels[currentModelIndex];
    let gate = checkGate(currentModel);
    
    // Cycle through queue if the current model is blocked
    let loopCount = 0;
    while (gate.blocked && loopCount < uniqueModels.length) {
      logger.info(`Model ${currentModel} is rate-limited, switching to next model in queue...`);
      currentModelIndex = (currentModelIndex + 1) % uniqueModels.length;
      currentModel = uniqueModels[currentModelIndex];
      gate = checkGate(currentModel);
      loopCount++;
    }

    if (gate.blocked) {
      // All models are blocked
      if (failFast) {
        logger.warn(`All models in queue are rate-limited, failing fast on ${currentModel}`);
        throw new Error(`Rate limit active. Please wait ${Math.ceil(gate.waitMs / 1000)}s.`);
      }
      logger.warn({ waitMs: Math.round(gate.waitMs) }, 'All models rate-limited, waiting before retry');
      await sleep(Math.min(gate.waitMs, 30000));
      continue;
    }

    try {
      return await fn(currentModel);
    } catch (err) {
      const { category, recovery } = classifyError(err as Error);
      if (category === 'rate_limit' || category === 'overloaded') {
        const retryAfter = extractRetryAfter(err) || recovery.retryAfterMs;
        tripGate(currentModel, retryAfter);
        
        logger.warn(`Rate limit hit on ${currentModel}. Tripping gate.`);
        
        // Let the outer loop cycle to the next model automatically on next iteration
        continue;
      }
      throw err;
    }
  }
}

import { compressContext } from './context-compressor.js'

export async function queryAgent(options: AgentOptions): Promise<AgentResult> {
  const client = getClient()
  const model = getModel()
  const maxTurns = options.maxTurns ?? AGENT_MAX_TURNS

  const systemPrompt = options.systemPrompt || `You are an AI assistant running in OpenCode OS.
You have access to tools to read/write files, execute commands, search the web, and search code.
Respond concisely and helpfully.`

  const rawMessages = options.messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content
  }))

  const compressedMessages = compressContext(rawMessages, 4000)

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...compressedMessages
  ]

  let totalInput = 0
  let totalOutput = 0
  let turns = 0
  let finalText = ''

  let activeModelUsed = model

  while (turns < maxTurns) {
    turns++
    if (options.onTyping) options.onTyping()

    const tools = options.tools !== undefined ? options.tools : availableTools

    const completion = await retryOnRateLimit(
      model,
      (activeModel) => {
        activeModelUsed = activeModel
        return client.chat.completions.create({
          model: activeModel,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          max_tokens: 4096,
        }, { signal: options.signal })
      },
      2,
      options.failFast
    )

    const choice = completion.choices[0]
    totalInput += completion.usage?.prompt_tokens ?? 0
    totalOutput += completion.usage?.completion_tokens ?? 0

    if (choice.finish_reason === 'stop') {
      finalText = choice.message.content ?? ''
      break
    }

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      messages.push({
        role: 'assistant',
        content: choice.message.content ?? '',
        tool_calls: choice.message.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }))
      })

      for (const tc of choice.message.tool_calls) {
        const result = await executeToolCall({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    } else {
      finalText = choice.message.content ?? ''
      break
    }
  }

  return {
    text: finalText || null,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    model: activeModelUsed,
  }
}
