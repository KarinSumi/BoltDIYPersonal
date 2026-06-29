import { getClient, getModel } from './llm-client.js'
import { queryAgent, AgentMessage, AgentResult, retryOnRateLimit, availableTools, executeToolCall } from './opencode-agent.js'
import { listAgents, createKanbanBoard, getKanbanBoard, listKanbanBoards, archiveKanbanBoard, createKanbanTask, getKanbanTask, listKanbanTasks, setKanbanTaskStatus, cancelKanbanTask, getBoardProgress } from './orchestrator.js'
import { getMemoryContext, addGoodMemory, addBadMemory } from './memory.js'
import { logger } from './logger.js'
import { AGENT_MAX_TURNS } from './config.js'
import { handleCeoOrder } from './ceo-chain.js'
import type OpenAI from 'openai'

// ── Complexity classifier (fast path, no LLM call) ──

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|good morning|good evening|good afternoon|what's up|yo|sup)$/i,
  /^(thanks|thank you|ty|thx|appreciate it|cheers)$/i,
  /^(bye|goodbye|see ya|see you|later|cya)$/i,
  /^(ok|okay|k|sure|yes|no|yep|nope|maybe)$/i,
  /what(?:'s| is) (?:my|the|a) .{1,30}\??$/i,
  /^(tell me|show me|what is|who is|when is|where is|how (?:do|to|does|can) )/i,
  /^(read|open|show|list|cat|find) /i,
  /^(search|google|look up|find|check) /i,
  /^(status|progress|how far|done yet|finished)\??$/i,
  /^(set|change|update|turn) /i,
  /^(lock|unlock|pin) /i,
]

const COMPLEX_KEYWORDS = [
  'build', 'create', 'develop', 'implement', 'design', 'architect',
  'multi-step', 'project', 'complex', 'full stack', 'fullstack',
  'dashboard', 'application', 'service', 'platform', 'system',
  'research.*write', 'write.*research',
  'deploy', 'configure', 'set up', 'setup', 'migrate',
  'frontend.*backend', 'backend.*frontend', 'api.*ui', 'ui.*api',
  'document.*code', 'code.*document',
]

const COMPLEX_KEYWORD_REGEX = new RegExp(COMPLEX_KEYWORDS.map(k => `(?=.*${k})`).join('|'), 'i')

export function classifyComplexity(message: string): 'direct' | 'delegate' {
  const trimmed = message.trim()

  if (SIMPLE_PATTERNS.some(p => p.test(trimmed))) {
    return 'direct'
  }

  const wordCount = trimmed.split(/\s+/).length
  if (wordCount < 3) return 'direct'

  if (COMPLEX_KEYWORD_REGEX.test(trimmed)) {
    return 'delegate'
  }

  const sentenceCount = trimmed.split(/[.!?]+/).filter(Boolean).length
  const multiSentence = sentenceCount >= 3

  const mentionsAgents = listAgents().some(a =>
    a.id !== 'main' && trimmed.toLowerCase().includes(a.name.toLowerCase().split(' ')[0])
  )

  if (multiSentence || mentionsAgents) return 'delegate'

  if (wordCount > 15 && /and|then|also|plus|after|while|during/.test(trimmed)) return 'delegate'

  return 'direct'
}

// ── Orchestrator system prompt ──

function buildSystemPrompt(agentCatalog: string): string {
  return `You are the Master Orchestrator of OpenCode OS. You are the user's sole interface.
The user does NOT see any other agents. You decide when and how to delegate work.

## Your Role
1. **Listen & Clarify** — Understand the user's request fully before acting. Ask questions if requirements are vague.
2. **Judge Complexity** — Simple requests (greetings, trivial Q&A, single file reads) answer directly. Complex multi-step projects: break into tasks, delegate, track.
3. **Route Tasks Correctly** — Choose task_type carefully for every task.
4. **Fork When Possible** — Use fork_tasks to create multiple parallel or sequential tasks in one call.
5. **Track & Report** — Monitor task progress. Give the user a clear status update when tasks complete.

## Task Type Routing Rules (CRITICAL)
- task_type="opencode" → writing code, editing files, debugging, creating projects, refactoring, building tools, any file modification
- task_type="nim" → research, web search, answering questions, writing docs, analysis, planning, summarizing, Q&A

## Fork Pattern — Use for Complex Goals
When a goal needs multiple steps, use fork_tasks to create them all at once:
1. Research task (nim) — gather context and requirements
2. Implementation task (opencode) — write/edit actual code, depends on step 1
3. Documentation task (nim) — write docs/summary, depends on step 2

## Available Specialist Agents
${agentCatalog}

## Tools Available
- \`fork_tasks(board_id, tasks[])\` — Create multiple tasks at once (parallel or sequential) ← USE THIS FOR COMPLEX GOALS
- \`create_kanban_board(title, description, priority, owner)\` — Start a new kanban board for a goal
- \`list_kanban_boards(owner, status?)\` — List boards for a user
- \`get_board_status(board_id)\` — Show board details and all tasks
- \`archive_kanban_board(board_id, summary)\` — Mark board as complete
- \`create_kanban_task(board_id, title, prompt, priority, task_type, depends_on?)\` — Add one task to a board
- \`get_kanban_task(task_id)\` — View a single task
- \`create_sub_task(parent_task_id, title, prompt)\` — Create a child sub-task on the same board
- \`set_task_status(task_id, status)\` — Override a task's status (ready, running, blocked, cancelled)
- \`cancel_kanban_task(task_id)\` — Cancel a task
- \`get_board_progress(board_id)\` — Get completion percentage
- \`web_search(query)\` — Search the live internet for news, facts, and current events. Always use this first before searching local files for general knowledge or news.
- \`web_fetch(url)\` — Fetch the text content of a webpage
- \`learn_from_success(summary)\` — Write to memory/good.md when the user praises an action or you achieve a complex goal successfully.
- \`learn_from_failure(summary)\` — Write to memory/bad.md when you make a mistake, hit an error, or the user corrects you, so you avoid it in the future.

## Rules
- Respond directly for simple requests. No kanban board needed.
- For complex requests: create a board, then use fork_tasks to add all tasks at once.
- After creating tasks, tell the user what you've started in plain language. Never show task IDs.
- Never reveal agent IDs, task IDs, or internal architecture to the user.
- Keep responses concise and human-friendly.
${getMemoryContext()}`
}

// ── Orchestrator custom tool definitions ──

const ORCHESTRATOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_kanban_board',
      description: 'Start a new kanban board for a complex goal. Returns board_id.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Board title (the goal)' },
          description: { type: 'string', description: 'Optional description' },
          priority: { type: 'number', description: 'Priority 1-5 (default 3)' },
          owner: { type: 'string', description: 'User identifier (chat ID)' },
        },
        required: ['title', 'owner'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_kanban_boards',
      description: 'List all boards for a user, optionally filtered by status.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'User identifier (chat ID)' },
          status: { type: 'string', description: 'Filter by status: active, paused, archived' },
        },
        required: ['owner'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_board_status',
      description: 'Get board details and all its tasks with current statuses.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'The board ID' },
        },
        required: ['board_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'archive_kanban_board',
      description: 'Mark a board as complete with a summary of results.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'The board ID' },
          summary: { type: 'string', description: 'Summary of what was accomplished' },
        },
        required: ['board_id', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_kanban_task',
      description: 'Add a new task to a kanban board. A specialist agent will pick it up automatically. Use task_type to route to the right executor.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'The board ID' },
          title: { type: 'string', description: 'Short task title' },
          prompt: { type: 'string', description: 'Detailed instructions for the specialist agent' },
          priority: { type: 'number', description: 'Priority 1-5 (default 3)' },
          task_type: {
            type: 'string',
            enum: ['nim', 'opencode'],
            description: 'Use "opencode" for: writing code, editing files, debugging, refactoring, building. Use "nim" for: research, Q&A, analysis, writing docs, summarizing.',
          },
          depends_on: { type: 'string', description: 'JSON array of task IDs this depends on' },
        },
        required: ['board_id', 'title', 'prompt', 'task_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kanban_task',
      description: 'Get full details of a single task including result and error.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task ID' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_sub_task',
      description: 'Create a child sub-task on the same board as the parent. Used for self-decomposition by specialist agents.',
      parameters: {
        type: 'object',
        properties: {
          parent_task_id: { type: 'string', description: 'The parent task ID' },
          title: { type: 'string', description: 'Short sub-task title' },
          prompt: { type: 'string', description: 'Detailed instructions' },
        },
        required: ['parent_task_id', 'title', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_task_status',
      description: 'Manually set a task status (e.g. blocked, cancelled, ready).',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task ID' },
          status: { type: 'string', description: 'New status: ready, blocked, cancelled, triage' },
          result: { type: 'string', description: 'Optional result text' },
        },
        required: ['task_id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_kanban_task',
      description: 'Cancel a running or pending task by its ID.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task ID to cancel' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_board_progress',
      description: 'Get the completion percentage for a board.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'The board ID' },
        },
        required: ['board_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fork_tasks',
      description: 'Create multiple tasks at once for a complex goal. Tasks can run in parallel or in sequence. Use this instead of calling create_kanban_task multiple times.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'The board ID' },
          tasks: {
            type: 'array',
            description: 'List of tasks to create',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short task title' },
                prompt: { type: 'string', description: 'Detailed instructions for the agent' },
                task_type: {
                  type: 'string',
                  enum: ['nim', 'opencode'],
                  description: 'nim=fast LLM (research/docs/analysis), opencode=deep coder (file edits/debugging/building)',
                },
                depends_on_index: {
                  type: 'number',
                  description: '0-based index of another task in this array to wait for before starting. Omit for parallel execution.',
                },
              },
              required: ['title', 'prompt', 'task_type'],
            },
          },
        },
        required: ['board_id', 'tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'learn_from_success',
      description: 'Write to memory/good.md when the user praises an action or you achieve a complex goal successfully.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of the success' },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'learn_from_failure',
      description: 'Write to memory/bad.md when you make a mistake, hit an error, or the user corrects you, so you avoid it in the future.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of the mistake' },
        },
        required: ['summary'],
      },
    },
  },
]

const webSearchTool = availableTools.find(t => t.function.name === 'web_search')
const webFetchTool = availableTools.find(t => t.function.name === 'web_fetch')
if (webSearchTool && webFetchTool) {
  ORCHESTRATOR_TOOLS.push(webSearchTool, webFetchTool)
}

// ── Argument validation helpers (exported for testing) ──

export const VALID_TASK_STATUSES = new Set([
  'triage', 'ready', 'running', 'blocked', 'completed', 'failed', 'cancelled', 'paused',
])

function requireStr(val: unknown, name: string): string | null {
  if (typeof val === 'string' && val.length > 0) return val
  return null
}

function requireOptStr(val: unknown): string | undefined {
  if (typeof val === 'string' && val.length > 0) return val
  return undefined
}

function requireNum(val: unknown): number | null {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (typeof val === 'string' && val.length > 0) {
    const n = Number(val)
    if (!Number.isNaN(n)) return n
  }
  return null
}

function missingArg(name: string): string {
  return `Missing or invalid required argument: ${name}`
}

// ── Tool executor for orchestrator (exported for testing) ──

export async function executeOrchestratorTool(toolCall: {
  name: string; arguments: string
}): Promise<string> {
  let args: any
  try {
    args = JSON.parse(toolCall.arguments)
  } catch {
    return JSON.stringify({ error: 'Invalid JSON in tool arguments', tool: toolCall.name })
  }

  try {
    switch (toolCall.name) {
      case 'web_search':
      case 'web_fetch':
        return await executeToolCall({ id: 'dummy', type: 'function', function: toolCall })

      case 'create_kanban_board': {
        const title = requireStr(args.title, 'title'); if (!title) return JSON.stringify({ error: missingArg('title') })
        const owner = requireStr(args.owner, 'owner'); if (!owner) return JSON.stringify({ error: missingArg('owner') })
        const description = requireOptStr(args.description)
        const priority = requireNum(args.priority) ?? undefined
        const id = createKanbanBoard(title, description, priority, owner)
        logger.info({ boardId: id, title }, 'Board created')
        return JSON.stringify({ board_id: id, status: 'active' })
      }
      case 'list_kanban_boards': {
        const owner = requireStr(args.owner, 'owner'); if (!owner) return JSON.stringify({ error: missingArg('owner') })
        const boards = listKanbanBoards(owner, requireOptStr(args.status))
        return JSON.stringify({ boards: boards.map(b => ({
          id: b.id,
          title: b.title,
          status: b.status,
          progress: b.progress_pct,
          tasks: `${b.completed_count}/${b.task_count}`,
        }))})
      }
      case 'get_board_status': {
        const boardId = requireStr(args.board_id, 'board_id'); if (!boardId) return JSON.stringify({ error: missingArg('board_id') })
        const board = getKanbanBoard(boardId)
        if (!board) return JSON.stringify({ error: 'Board not found' })
        const tasks = listKanbanTasks(boardId)
        return JSON.stringify({
          board: { id: board.id, title: board.title, status: board.status, priority: board.priority, progress_pct: board.progress_pct, task_count: board.task_count, completed_count: board.completed_count },
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            assignee: t.assignee,
            priority: t.priority,
            retry_count: t.retry_count,
            max_retries: t.max_retries,
            result: t.result ? String(t.result).slice(0, 200) : null,
            error: t.error ? String(t.error).slice(0, 200) : null,
          })),
        })
      }
      case 'archive_kanban_board': {
        const boardId = requireStr(args.board_id, 'board_id'); if (!boardId) return JSON.stringify({ error: missingArg('board_id') })
        const summary = requireStr(args.summary, 'summary'); if (!summary) return JSON.stringify({ error: missingArg('summary') })
        const board = getKanbanBoard(boardId)
        if (!board) return JSON.stringify({ error: 'Board not found' })
        archiveKanbanBoard(boardId, summary)
        logger.info({ boardId }, 'Board archived')
        return JSON.stringify({ status: 'archived', board_id: boardId })
      }
      case 'create_kanban_task': {
        const boardId = requireStr(args.board_id, 'board_id'); if (!boardId) return JSON.stringify({ error: missingArg('board_id') })
        const title = requireStr(args.title, 'title'); if (!title) return JSON.stringify({ error: missingArg('title') })
        const prompt = requireStr(args.prompt, 'prompt'); if (!prompt) return JSON.stringify({ error: missingArg('prompt') })
        const assignee = requireOptStr(args.assignee)
        const priority = requireNum(args.priority) ?? undefined
        const depends_on = requireOptStr(args.depends_on)
        const taskType = (args.task_type === 'opencode' ? 'opencode' : 'nim') as 'nim' | 'opencode'
        const id = createKanbanTask(boardId, title, prompt, assignee, priority, depends_on, taskType)
        logger.info({ taskId: id, boardId, title, taskType }, 'Task created')
        return JSON.stringify({ task_id: id, status: 'created', task_type: taskType })
      }
      case 'fork_tasks': {
        const boardId = requireStr(args.board_id, 'board_id'); if (!boardId) return JSON.stringify({ error: missingArg('board_id') })
        if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
          return JSON.stringify({ error: 'tasks must be a non-empty array' })
        }
        const taskIds: string[] = []
        for (const t of args.tasks as Array<{ title: string; prompt: string; task_type: string; depends_on_index?: number }>) {
          const dependsOn = (t.depends_on_index !== undefined && taskIds[t.depends_on_index])
            ? JSON.stringify([taskIds[t.depends_on_index]])
            : undefined
          const tType = (t.task_type === 'opencode' ? 'opencode' : 'nim') as 'nim' | 'opencode'
          const id = createKanbanTask(boardId, t.title, t.prompt, undefined, 3, dependsOn, tType)
          taskIds.push(id)
          logger.info({ taskId: id, boardId, title: t.title, taskType: tType }, 'Forked task created')
        }
        return JSON.stringify({ task_ids: taskIds, count: taskIds.length, status: 'created' })
      }
      case 'get_kanban_task': {
        const taskId = requireStr(args.task_id, 'task_id'); if (!taskId) return JSON.stringify({ error: missingArg('task_id') })
        const task = getKanbanTask(taskId)
        return JSON.stringify(task ? { ...task, result: task.result?.slice(0, 500), error: task.error?.slice(0, 500) } : { error: 'Task not found' })
      }
      case 'create_sub_task': {
        const parentId = requireStr(args.parent_task_id, 'parent_task_id'); if (!parentId) return JSON.stringify({ error: missingArg('parent_task_id') })
        const title = requireStr(args.title, 'title'); if (!title) return JSON.stringify({ error: missingArg('title') })
        const prompt = requireStr(args.prompt, 'prompt'); if (!prompt) return JSON.stringify({ error: missingArg('prompt') })
        const parent = getKanbanTask(parentId)
        if (!parent) return JSON.stringify({ error: 'Parent task not found' })
        const id = createKanbanTask(parent.board_id, title, prompt, undefined, parent.priority)
        logger.info({ taskId: id, parentId, title }, 'Sub-task created')
        return JSON.stringify({ task_id: id, status: 'created', board_id: parent.board_id })
      }
      case 'set_task_status': {
        const taskId = requireStr(args.task_id, 'task_id'); if (!taskId) return JSON.stringify({ error: missingArg('task_id') })
        const status = requireStr(args.status, 'status'); if (!status) return JSON.stringify({ error: missingArg('status') })
        if (!VALID_TASK_STATUSES.has(status)) {
          return JSON.stringify({ error: `Invalid status "${status}". Valid: ${[...VALID_TASK_STATUSES].join(', ')}` })
        }
        const task = getKanbanTask(taskId)
        if (!task) return JSON.stringify({ error: 'Task not found' })
        setKanbanTaskStatus(taskId, status, args.result)
        return JSON.stringify({ status: 'updated', task_id: taskId, new_status: status })
      }
      case 'cancel_kanban_task': {
        const taskId = requireStr(args.task_id, 'task_id'); if (!taskId) return JSON.stringify({ error: missingArg('task_id') })
        const task = getKanbanTask(taskId)
        if (!task) return JSON.stringify({ error: 'Task not found' })
        cancelKanbanTask(taskId)
        return JSON.stringify({ status: 'cancelled', task_id: taskId })
      }
      case 'get_board_progress': {
        const boardId = requireStr(args.board_id, 'board_id'); if (!boardId) return JSON.stringify({ error: missingArg('board_id') })
        const board = getKanbanBoard(boardId)
        if (!board) return JSON.stringify({ error: 'Board not found' })
        const pct = getBoardProgress(boardId)
        return JSON.stringify({ board_id: boardId, progress_pct: pct })
      }
      case 'learn_from_success': {
        const summary = requireStr(args.summary, 'summary'); if (!summary) return JSON.stringify({ error: missingArg('summary') })
        addGoodMemory(summary)
        return JSON.stringify({ status: 'success recorded', summary })
      }
      case 'learn_from_failure': {
        const summary = requireStr(args.summary, 'summary'); if (!summary) return JSON.stringify({ error: missingArg('summary') })
        addBadMemory(summary)
        return JSON.stringify({ status: 'failure recorded', summary })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` })
    }
  } catch (err) {
    const msg = (err as Error).message
    logger.error({ err: msg, tool: toolCall.name }, 'Tool execution error')
    return JSON.stringify({ error: `Tool error: ${msg}` })
  }
}

// ── Orchestrator entry point ──

export interface OrchestratorOptions {
  messages: AgentMessage[]
  chatId: string
  signal?: AbortSignal
  failFast?: boolean
}

export interface OrchestratorResult {
  text: string
  finalState?: string
  sessionId?: string
}

import { compressContext } from './context-compressor.js'

export async function runOrchestrator(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const catalog = listAgents().map(a =>
    `- ${a.id}: ${a.name} — ${a.capabilities?.join(', ') || a.personality.slice(0, 80)}`
  ).join('\n')

  const systemPrompt = buildSystemPrompt(catalog)

  const rawMessages = options.messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  const compressedMessages = compressContext(rawMessages, 4000)

  // ── CEO Chain interception ──

  const lastMsg = options.messages[options.messages.length - 1]?.content || ''
  const isCeoOrder = classifyComplexity(lastMsg) === 'delegate' && (
    lastMsg.toLowerCase().includes('ceo') ||
    lastMsg.toLowerCase().includes('build') ||
    lastMsg.toLowerCase().includes('create') ||
    lastMsg.toLowerCase().includes('develop') ||
    lastMsg.toLowerCase().includes('implement') ||
    COMPLEX_KEYWORD_REGEX.test(lastMsg)
  )

  if (isCeoOrder) {
    const result = await handleCeoOrder(lastMsg, options.chatId)
    return {
      text: `🧠 **CEO Chain of Command Activated**\n\n**Plan:**\n${result.plan}\n\n**Status:** ${result.summary}`,
      sessionId: result.boardId,
    }
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...compressedMessages
  ]

  const client = getClient()
  const model = getModel()
  const maxTurns = Math.min(AGENT_MAX_TURNS, 15)
  let turns = 0
  let finalText = ''
  let sessionId: string | undefined

  while (turns < maxTurns) {
    turns++

    const completion = await retryOnRateLimit(
      model,
      (activeModel) =>
        client.chat.completions.create({
          model: activeModel,
          messages,
          tools: ORCHESTRATOR_TOOLS,
          tool_choice: 'auto',
          max_tokens: 4096,
        }, { signal: options.signal }),
      2,
      options.failFast
    )

    const choice = completion.choices[0]

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
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      })

      for (const tc of choice.message.tool_calls) {
        const result = await executeOrchestratorTool({
          name: tc.function.name,
          arguments: tc.function.arguments,
        })

        try {
          const parsed = JSON.parse(result)
          if (parsed.session_id && !sessionId) sessionId = parsed.session_id
        } catch { /* ignore */ }

        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    } else {
      finalText = choice.message.content ?? ''
      break
    }
  }

  return { text: finalText || 'No response generated.', sessionId }
}

// ── Instant responses (zero-latency, no LLM) ──

const INSTANT_RESPONSES: Array<[RegExp, string]> = [
  [/^(hi|hello|hey|yo|sup)[\s!?]*$/i, 'Hey! What can I do for you?'],
  [/^(good morning|good evening|good afternoon)[\s!?]*$/i, 'Hi! How can I help?'],
  [/^(thanks|thank you|ty|thx|cheers)[\s!?]*$/i, 'No problem! Anything else?'],
  [/^(bye|goodbye|see ya|see you|later|cya)[\s!?]*$/i, 'Later! 👋'],
  [/^(ok|okay|k|sure|alright|got it)[\s!?]*$/i, '👍'],
  [/^(yes|yep|yeah|yup)[\s!?]*$/i, '👍'],
  [/^(no|nope|nah)[\s!?]*$/i, 'Got it.'],
]

// ── Direct response for simple requests ──

export async function respondDirect(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const lastMsg = options.messages[options.messages.length - 1]
  const text = lastMsg?.content?.trim() ?? ''

  // Zero-latency instant responses — no LLM call needed
  for (const [pattern, response] of INSTANT_RESPONSES) {
    if (pattern.test(text)) {
      return { text: response }
    }
  }

  // Stable system prefix (Cacheable)
  const systemPrompt = `You are OpenCode OS, a personal AI assistant. Respond concisely and helpfully. Keep responses brief.`

  const rawMessages = options.messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))
  
  // Volatile suffix (Appended to the latest user message to protect the system prompt cache)
  if (rawMessages.length > 0) {
    const last = rawMessages[rawMessages.length - 1]
    if (last.role === 'user') {
      last.content = `${last.content}\n\n[System Context: Today is ${new Date().toDateString()}]`
    }
  }

  const compressedMessages = compressContext(rawMessages, 2000)

  const result = await queryAgent({
    messages: compressedMessages as unknown as AgentMessage[], // Cast since compressContext wants AgentMessage
    systemPrompt,
    maxTurns: 3,
    signal: options.signal,
    tools: [],
    failFast: false,
  })

  return { text: result.text || "I'm here. What do you need?" }
}
