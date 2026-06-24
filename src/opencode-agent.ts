import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { dirname } from 'path'
import { globSync } from 'glob'
import { getClient, getModel } from './llm-client.js'
import { AGENT_MAX_TURNS } from './config.js'
import { logger } from './logger.js'

import type OpenAI from 'openai'

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

const availableTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments)

  switch (toolCall.function.name) {
    case 'read_file': {
      try {
        return readFileSync(args.path, 'utf-8').slice(0, 50000)
      } catch (e: unknown) {
        return `Error reading file: ${(e as Error).message}`
      }
    }
    case 'write_file': {
      try {
        const dir = dirname(args.path)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(args.path, args.content, 'utf-8')
        return `File written: ${args.path}`
      } catch (e: unknown) {
        return `Error writing file: ${(e as Error).message}`
      }
    }
    case 'bash': {
      try {
        const opts: Record<string, unknown> = { maxBuffer: 2 * 1024 * 1024, timeout: 30000 }
        if (args.workdir) opts.cwd = args.workdir
        const output = execSync(args.command, opts)
        return output.toString().slice(0, 50000)
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string }
        return err.stderr?.toString().slice(0, 10000) || err.stdout?.toString().slice(0, 10000) || (e as Error).message
      }
    }
    case 'glob': {
      try {
        return globSync(args.pattern, { dot: true }).join('\n').slice(0, 10000) || 'No matches'
      } catch {
        return 'Error: invalid glob pattern'
      }
    }
    case 'grep': {
      try {
        const escaped = args.pattern.replace(/"/g, '\\"')
        const includeFlag = args.include ? ` -g "${args.include.replace(/"/g, '\\"')}"` : ''
        const cmd = `rg --no-heading -n "${escaped}"${includeFlag} 2>nul || findstr /s /n /r "${escaped}" *`
        const output = execSync(cmd, { maxBuffer: 2 * 1024 * 1024, timeout: 15000 })
        return output.toString().slice(0, 50000)
      } catch {
        return 'No matches found'
      }
    }
    case 'web_search': {
      try {
        const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1`)
        const data = await resp.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> }
        return data.AbstractText || (data.RelatedTopics?.slice(0, 5).map((t: { Text?: string; FirstURL?: string }) => `${t.Text} (${t.FirstURL})`).join('\n')) || 'No results'
      } catch (e: unknown) {
        return `Search error: ${(e as Error).message}`
      }
    }
    case 'web_fetch': {
      try {
        const resp = await fetch(args.url, { headers: { 'User-Agent': 'OpenCode-OS/1.0' } })
        const text = await resp.text()
        return text.slice(0, 50000)
      } catch (e: unknown) {
        return `Fetch error: ${(e as Error).message}`
      }
    }
    default:
      return `Unknown tool: ${toolCall.function.name}`
  }
}

export async function queryAgent(options: AgentOptions): Promise<AgentResult> {
  const client = getClient()
  const model = getModel()
  const maxTurns = options.maxTurns ?? AGENT_MAX_TURNS

  const systemPrompt = options.systemPrompt || `You are an AI assistant running in OpenCode OS.
You have access to tools to read/write files, execute commands, search the web, and search code.
Respond concisely and helpfully.`

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...options.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))
  ]

  let totalInput = 0
  let totalOutput = 0
  let turns = 0
  let finalText = ''

  while (turns < maxTurns) {
    turns++
    if (options.onTyping) options.onTyping()

    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: availableTools,
      tool_choice: 'auto',
      max_tokens: 4096,
    }, { signal: options.signal })

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
    model,
  }
}
