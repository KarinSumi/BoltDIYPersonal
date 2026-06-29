import { Bot, Context } from 'grammy'
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID, MAX_MESSAGE_LENGTH, SECURITY_PIN_HASH, AGENT_TIMEOUT_MS, TYPING_REFRESH_MS } from './config.js'
import { AgentMessage } from './opencode-agent.js'
import { clearSession, insertTurn, getRecentTurns } from './db.js'
import { enqueue } from './message-queue.js'
import { logger } from './logger.js'
import { voiceEnabledChats, chatEvents, abortControllers } from './state.js'
import { listAgents, listKanbanBoards, listKanbanTasks, getKanbanBoard, getKanbanTask, isDelegationRequest, getAgent, createKanbanBoard, createKanbanTask, setKanbanTaskStatus } from './orchestrator.js'
import { classifyComplexity, runOrchestrator, respondDirect } from './master-orchestrator.js'
import { isLocked, lock, unlock, checkKillPhrase, resetIdleTimer } from './security.js'
import { classifyError } from './errors.js'
import { touchActivity } from './state.js'
import { insertScheduledTask, insertMission, listScheduledTasks, listMissions } from './db.js'
import { syncAllBoardsToFiles } from './obsidian-sync.js'
import { v4 as uuid } from 'uuid'

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /you\s+are\s+(not\s+)?(open|now|opencode)\s+/i,
  /system\s+prompt/i,
  /forget\s+(all\s+)?instructions/i,
  /new\s+instructions/i,
]

function formatForTelegram(text: string): string {
  let result = text

  const codeBlocks: string[] = []
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`)
    return placeholder
  })

  const inlineCodes: string[] = []
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    const placeholder = `%%INLINE_CODE_${inlineCodes.length}%%`
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`)
    return placeholder
  })

  result = result.replace(/^### (.+)$/gm, '<b>$1</b>')
  result = result.replace(/^## (.+)$/gm, '<b>$1</b>')
  result = result.replace(/^# (.+)$/gm, '<b>$1</b>')
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  result = result.replace(/__(.+?)__/g, '<b>$1</b>')
  result = result.replace(/\*(.+?)\*/g, '<i>$1</i>')
  result = result.replace(/_(.+?)_/g, '<i>$1</i>')
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>')
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  result = result.replace(/^- \[ \] /gm, '☐ ')
  result = result.replace(/^- \[x\] /gmi, '☑ ')
  result = result.replace(/^---+/gm, '—')
  result = result.replace(/^\*\*\*+/gm, '—')

  result = result.replace(/%%CODE_BLOCK_(\d+)%%/g, (_match, idx) => codeBlocks[parseInt(idx)])
  result = result.replace(/%%INLINE_CODE_(\d+)%%/g, (_match, idx) => inlineCodes[parseInt(idx)])
  result = result.replace(/%%(CODE_BLOCK|INLINE_CODE)_\d+%%/g, '')

  return result
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function splitMessage(text: string, limit = MAX_MESSAGE_LENGTH): string[] {
  const parts: string[] = []
  while (text.length > limit) {
    let splitAt = text.lastIndexOf('\n', limit)
    if (splitAt === -1) splitAt = limit
    parts.push(text.slice(0, splitAt))
    text = text.slice(splitAt).trim()
  }
  if (text) parts.push(text)
  return parts
}

export function createBot(): Bot {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error('TELEGRAM_BOT_TOKEN is not set')
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN)

  // Prevent uncaught error events from crashing the process
  chatEvents.on('error', (event: { chatId?: string; message?: string; data?: string }) => {
    logger.warn({ chatId: event.chatId, err: event.message ?? event.data }, 'Chat event error (suppressed)')
  })

  function isAuthorisedChat(ctx: Context): boolean {
    const chatId = String(ctx.chat?.id ?? '')
    return isAuthorised(chatId)
  }

  // ── Per-command rate limiter middleware ──
  bot.use(async (ctx, next) => {
    if (ctx.message?.text?.startsWith('/')) {
      const chatId = String(ctx.chat!.id)
      if (!checkRateLimit(chatId)) {
        await ctx.reply('Rate limit exceeded. Please slow down (max 10 commands per minute).')
        return
      }
    }
    await next()
  })

  // ── Rate limiter: per-chat sliding window ──
  const RATE_LIMIT_WINDOW = 60_000
  const RATE_LIMIT_MAX = 10
  const chatTimestamps = new Map<string, number[]>()

  function checkRateLimit(chatId: string): boolean {
    const now = Date.now()
    const timestamps = chatTimestamps.get(chatId) || []
    const filtered = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW)
    if (filtered.length >= RATE_LIMIT_MAX) {
      chatTimestamps.set(chatId, filtered)
      return false
    }
    filtered.push(now)
    chatTimestamps.set(chatId, filtered)
    return true
  }

  // Clean stale rate limiter entries every 5 minutes
  const RATE_LIMITER_CLEANUP_INTERVAL = 300_000
  const rateLimiterCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2
    for (const [chatId, timestamps] of chatTimestamps) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        chatTimestamps.delete(chatId)
      }
    }
  }, RATE_LIMITER_CLEANUP_INTERVAL)

  // Allow cleanup timer to be cleared for testing / restart
  ;(bot as any).__rateLimiterCleanupTimer = rateLimiterCleanupTimer

  bot.command('start', (ctx) => {
    ctx.reply('OpenCode OS is running. Send me a message!')
  })

  bot.command('help', (ctx) => {
    ctx.reply(
      'Available commands:\n' +
      '/chatid — Show your chat ID\n' +
      '/newchat — Clear conversation history\n' +
      '/agents — List available agents\n' +
      '/pin <code> — Unlock with a PIN\n' +
      '/lock — Lock the system immediately\n' +
      '/setpin <new_code> — Change the unlock PIN\n' +
      '/kanban — Show active kanban boards\n' +
      '/board <id> — Show board details and tasks\n' +
      '/taskinfo <id> — Show task details\n' +
      '/obssync — Sync all boards to Obsidian vault\n' +
      '/obswatch — Toggle Obsidian file watcher\n' +
      '/voice — Toggle voice replies\n' +
      '/help — Show this message'
    )
  })

  bot.command('chatid', (ctx) => {
    ctx.reply(`Your chat ID: ${ctx.chat?.id ?? 'unknown'}`)
  })

  bot.command('newchat', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const chatId = String(ctx.chat!.id)
    clearSession(chatId)
    ctx.reply('Session cleared. Starting fresh.')
  })

  bot.command('agents', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const agents = listAgents()
    if (agents.length === 0) {
      ctx.reply('No agents configured.')
      return
    }
    const list = agents.map(a => {
      const desc = a.personality.length > 200 ? a.personality.slice(0, 200) + '...' : a.personality
      return `\u2022 ${a.name} (\`${a.id}\`) \u2014 ${desc}`
    }).join('\n')
    ctx.reply(`Available agents:\n${list}`, { parse_mode: 'Markdown' })
  })

  bot.command('pin', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    if (!SECURITY_PIN_HASH) { ctx.reply('PIN not configured. Set SECURITY_PIN_HASH in .env to enable PIN locking.'); return }
    const code = ctx.match?.trim()
    if (!code) {
      ctx.reply('Usage: /pin <code>')
      return
    }
    const unlocked = unlock(code)
    if (unlocked) {
      touchActivity()
      resetIdleTimer()
      ctx.reply('System unlocked.')
    } else {
      ctx.reply('Invalid PIN.')
    }
  })

  bot.command('setpin', async (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const code = ctx.match?.trim()
    if (!code || code.length < 4) {
      ctx.reply('Usage: /setpin <new_code> (min 4 characters)')
      return
    }
    const { setPinHash } = await import('./security.js')
    const { readFileSync, writeFileSync } = await import('fs')
    const { join } = await import('path')
    const { PROJECT_ROOT } = await import('./config.js')

    const hash = setPinHash(code)
    const envPath = join(PROJECT_ROOT, '.env')
    let env = readFileSync(envPath, 'utf-8')

    if (env.includes('SECURITY_PIN_HASH=')) {
      env = env.replace(/^SECURITY_PIN_HASH=.*$/m, `SECURITY_PIN_HASH=${hash}`)
    } else {
      env += `\nSECURITY_PIN_HASH=${hash}\n`
    }

    writeFileSync(envPath, env)
    ctx.reply('PIN updated. Use /pin <code> to unlock.')
  })

  bot.command('task', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const chatId = String(ctx.chat!.id)
    const parts = ctx.match?.trim().split(/\s+/)
    if (!parts || parts.length < 2) {
      ctx.reply('Usage: /task <agent> <prompt>\nExample: /task dev Review the error logs')
      return
    }
    const agentId = parts[0]
    const prompt = parts.slice(1).join(' ')
    const tomorrow = new Date(Date.now() + 60000).toISOString()
    insertScheduledTask({
      id: uuid(), agent_id: agentId, chat_id: chatId, prompt,
      schedule: 'once', next_run: tomorrow,
    })
    ctx.reply(`Task created for agent "${agentId}". Will run in ~1 minute. Check /status later.`)
  })

  bot.command('mission', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const parts = ctx.match?.trim().split(/\s+/)
    if (!parts || parts.length < 2) {
      ctx.reply('Usage: /mission <title> | <prompt>\nExample: /mission Health Check | Run diagnostics')
      return
    }
    const sep = ctx.match!.indexOf('|')
    let title: string; let prompt: string
    if (sep !== -1) {
      title = ctx.match!.slice(0, sep).trim()
      prompt = ctx.match!.slice(sep + 1).trim()
    } else {
      title = parts[0]; prompt = parts.slice(1).join(' ')
    }
    insertMission({ id: uuid(), title, prompt, priority: 0 })
    ctx.reply(`Mission "${title}" created and queued.`)
  })

  bot.command('status', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const tasks = listScheduledTasks() as Array<{ id: string; prompt: string; agent_id: string; status: string; next_run: string }>
    const missions = listMissions() as Array<{ id: string; title: string; status: string; priority: number }>
    let msg = ''
    if (tasks.length > 0) {
      msg += '**Scheduled Tasks:**\n' + tasks.slice(0, 5).map(t =>
        `\u2022 ${t.prompt.slice(0, 60)} [${t.agent_id}] \u2014 ${t.status}`
      ).join('\n') + '\n\n'
    }
    if (missions.length > 0) {
      msg += '**Missions:**\n' + missions.slice(0, 5).map(m =>
        `\u2022 ${m.title} \u2014 ${m.status}`
      ).join('\n')
    }
    ctx.reply(msg || 'No tasks or missions yet.')
  })

  bot.command('lock', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    if (!SECURITY_PIN_HASH) { ctx.reply('PIN not configured. Set SECURITY_PIN_HASH in .env to enable locking.'); return }
    lock()
    ctx.reply('System locked. Send your PIN to unlock.')
  })

  bot.command('kanban', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const chatId = String(ctx.chat!.id)
    const boards = listKanbanBoards(chatId, 'active')
    if (boards.length === 0) {
      ctx.reply('No active kanban boards.')
      return
    }
    const lines: string[] = ['<b>Active Kanban Boards</b>\n']
    for (const b of boards) {
      const tasks = listKanbanTasks(b.id)
      const byStatus: Record<string, number> = {}
      for (const t of tasks) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1
      }
      const statusLine = Object.entries(byStatus)
        .map(([s, n]) => `${s}: ${n}`).join(', ') || 'no tasks'
      lines.push(
        `<b>${b.title}</b> (${b.completed_count}/${b.task_count} — ${b.progress_pct}%)`,
        `  ID: <code>${b.id}</code>`,
        `  Status: ${b.status}  |  ${statusLine}`,
        ''
      )
    }
    ctx.reply(lines.join('\n'), { parse_mode: 'HTML' })
  })

  bot.command('board', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const boardId = ctx.match?.trim()
    if (!boardId) {
      ctx.reply('Usage: /board <board_id>')
      return
    }
    const board = getKanbanBoard(boardId)
    if (!board) {
      ctx.reply('Board not found.')
      return
    }
    const tasks = listKanbanTasks(boardId)
    const lines: string[] = [
      `<b>${board.title}</b>`,
      `Status: ${board.status}  |  Progress: ${board.progress_pct}%  |  Tasks: ${board.completed_count}/${board.task_count}`,
      board.description ? `Description: ${board.description}` : '',
      ''
    ]
    if (tasks.length === 0) {
      lines.push('No tasks on this board.')
    } else {
      for (const t of tasks) {
        const statusIcon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'running' ? '🔄' : t.status === 'blocked' ? '⛔' : '⏳'
        lines.push(`${statusIcon} <b>${t.title}</b> (<code>${t.id.slice(0, 8)}</code>) — ${t.status}`)
        if (t.assignee) lines.push(`  Assignee: ${t.assignee}`)
        if (t.result) lines.push(`  Result: ${t.result.slice(0, 200)}`)
        if (t.error) lines.push(`  Error: ${t.error.slice(0, 200)}`)
      }
    }
    ctx.reply(lines.join('\n'), { parse_mode: 'HTML' })
  })

  bot.command('taskinfo', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const taskId = ctx.match?.trim()
    if (!taskId) {
      ctx.reply('Usage: /taskinfo <task_id>')
      return
    }
    const task = getKanbanTask(taskId)
    if (!task) {
      ctx.reply('Task not found.')
      return
    }
    const lines: string[] = [
      `<b>${task.title}</b>`,
      `ID: <code>${task.id}</code>`,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      task.assignee ? `Assigned to: ${task.assignee}` : 'Unassigned',
      task.depends_on ? `Dependencies: ${task.depends_on}` : 'No dependencies',
      `Retries: ${task.retry_count}/${task.max_retries}`,
      task.result ? `\nResult: ${task.result.slice(0, 500)}` : '',
      task.error ? `\nError: ${task.error.slice(0, 500)}` : '',
    ]
    ctx.reply(lines.join('\n'), { parse_mode: 'HTML' })
  })

  bot.command('voice', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const chatId = String(ctx.chat!.id)
    if (voiceEnabledChats.has(chatId)) {
      voiceEnabledChats.delete(chatId)
      ctx.reply('Voice replies disabled.')
    } else {
      voiceEnabledChats.add(chatId)
      ctx.reply('Voice replies enabled.')
    }
  })

  bot.command('obssync', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    const count = syncAllBoardsToFiles()
    if (count === 0) {
      ctx.reply('No active boards to sync, or Obsidian vault not configured.')
    } else {
      ctx.reply(`Synced ${count} board(s) to Obsidian vault.`)
    }
  })

  bot.command('obswatch', (ctx) => {
    if (!isAuthorisedChat(ctx)) return
    if (!process.env['OBSIDIAN_VAULT_PATH']) {
      ctx.reply('Obsidian vault not configured. Set OBSIDIAN_VAULT_PATH in your .env.')
      return
    }
    import('./obsidian-sync.js').then(mod => {
      if (mod.obsidianWatcherActive()) {
        mod.stopObsidianWatcher()
        ctx.reply('Obsidian watcher stopped.')
      } else {
        mod.startObsidianWatcher()
        ctx.reply('Obsidian watcher started. Waiting for file changes...')
      }
    }).catch(() => {
      ctx.reply('Failed to toggle Obsidian watcher.')
    })
  })

  const MAX_CONTENT_LENGTH = 8000

function guardContent(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text
  return text.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated at 8000 characters]'
}

async function guardedReply(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text)
  } catch {
    // reply failures are non-fatal (e.g. user blocked bot)
  }
}

async function guardedEnqueue(chatId: string, ctx: Context, fn: () => Promise<void>): Promise<void> {
  try {
    await enqueue(chatId, fn)
  } catch (err) {
    logger.error({ chatId, err: (err as Error).message }, 'Enqueue failed')
    await guardedReply(ctx, 'Internal error processing your request.')
  }
}

// ── Message handlers ──

  bot.on('message:text', async (ctx) => {
    try {
      const chatId = String(ctx.chat!.id)
      let text = guardContent(ctx.message.text)

      if (!isAuthorised(chatId)) {
        await guardedReply(ctx, 'Unauthorised. Check ALLOWED_CHAT_ID in your .env.')
        return
      }
      if (checkKillPhrase(text)) return
      if (isLocked()) {
        const unlocked = unlock(text)
        if (unlocked) {
          touchActivity(); resetIdleTimer()
          await guardedReply(ctx, 'System unlocked. Send your message again.')
        } else {
          await guardedReply(ctx, '\u26a0 System is locked. Enter your PIN to unlock.')
        }
        return
      }
      if (text.startsWith('/')) {
        await guardedReply(ctx, 'Unknown command. Type /help for available commands.')
        return
      }
      if (INJECTION_PATTERNS.some(p => p.test(text))) {
        logger.warn({ chatId, text }, 'Prompt injection attempt blocked')
        await guardedReply(ctx, 'Message rejected.')
        return
      }

      if (!checkRateLimit(chatId)) {
        await guardedReply(ctx, 'Rate limit exceeded. Please slow down (max 10 messages per minute).')
        return
      }

      touchActivity()
      resetIdleTimer()

      await guardedEnqueue(chatId, ctx, async () => {
        await handleUserMessage(ctx, chatId, text)
      })
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Unhandled error in text handler')
      await guardedReply(ctx, 'Internal error. Please try again.')
    }
  })

  bot.on('message:photo', async (ctx) => {
    try {
      const chatId = String(ctx.chat!.id)
      if (!isAuthorised(chatId)) { await guardedReply(ctx, 'Unauthorised.'); return }
      touchActivity()
      if (!checkRateLimit(chatId)) { await guardedReply(ctx, 'Rate limit exceeded.'); return }
      const caption = guardContent(ctx.message.caption || 'Analyze this image')
      await guardedReply(ctx, 'Image received. Processing with orchestrator...')
      await guardedEnqueue(chatId, ctx, async () => {
        await handleUserMessage(ctx, chatId, `[Image] ${caption}`)
      })
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Unhandled error in photo handler')
    }
  })

  bot.on('message:document', async (ctx) => {
    try {
      const chatId = String(ctx.chat!.id)
      if (!isAuthorised(chatId)) { await guardedReply(ctx, 'Unauthorised.'); return }
      touchActivity()
      if (!checkRateLimit(chatId)) { await guardedReply(ctx, 'Rate limit exceeded.'); return }
      const fileName = ctx.message.document.file_name || 'document'
      const caption = guardContent(ctx.message.caption || `Process this document: ${fileName}`)
      await guardedReply(ctx, `Document "${fileName}" received. Processing...`)
      await guardedEnqueue(chatId, ctx, async () => {
        await handleUserMessage(ctx, chatId, `[Document: ${fileName}] ${caption}`)
      })
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Unhandled error in document handler')
    }
  })

  bot.on('message:voice', async (ctx) => {
    try {
      const chatId = String(ctx.chat!.id)
      if (!isAuthorised(chatId)) { await guardedReply(ctx, 'Unauthorised.'); return }
      touchActivity()
      if (!checkRateLimit(chatId)) { await guardedReply(ctx, 'Rate limit exceeded.'); return }
      await guardedReply(ctx, 'Voice message received. (Voice-to-text coming soon)')
      await guardedEnqueue(chatId, ctx, async () => {
        await handleUserMessage(ctx, chatId, '[Voice message]')
      })
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Unhandled error in voice handler')
    }
  })

  bot.on('message:video', async (ctx) => {
    try {
      const chatId = String(ctx.chat!.id)
      if (!isAuthorised(chatId)) { await guardedReply(ctx, 'Unauthorised.'); return }
      touchActivity()
      if (!checkRateLimit(chatId)) { await guardedReply(ctx, 'Rate limit exceeded.'); return }
      const caption = guardContent(ctx.message.caption || 'Analyze this video')
      await guardedReply(ctx, 'Video received. Processing...')
      await guardedEnqueue(chatId, ctx, async () => {
        await handleUserMessage(ctx, chatId, `[Video] ${caption}`)
      })
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Unhandled error in video handler')
    }
  })

  return bot
}

function isAuthorised(chatId: string): boolean {
  if (!ALLOWED_CHAT_ID) return true
  return ALLOWED_CHAT_ID.split(',').map(id => id.trim()).includes(chatId)
}

async function handleUserMessage(ctx: Context, chatId: string, text: string): Promise<void> {
  const recentTurns = getRecentTurns(chatId, 'main', 6) as Array<{ role: string; content: string }>
  const messages: AgentMessage[] = [
    ...recentTurns.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
    { role: 'user', content: text },
  ]

  chatEvents.emit('user_message', { chatId, agentId: 'main', data: text, timestamp: Date.now() })

  // ── Typing indicator ──
  let isTypingActive = true
  const sendTyping = async () => {
    while (isTypingActive) {
      try {
        await ctx.api.sendChatAction(chatId, 'typing')
      } catch (err) {
        logger.debug({ err: (err as Error).message }, 'Typing action failed')
      }
      if (isTypingActive) await sleep(TYPING_REFRESH_MS)
    }
  }
  sendTyping()

  // ── Check @agent delegation ──
  const delegation = isDelegationRequest(text)
  if (delegation) {
    const agent = getAgent(delegation.agentId)
    if (agent) {
      isTypingActive = false
      const boardId = createKanbanBoardForAgent(chatId, delegation.agentId, delegation.prompt)
      await ctx.reply(
        `Delegating to **${agent.name}**: "${delegation.prompt.slice(0, 100)}${delegation.prompt.length > 100 ? '...' : ''}"\n\n` +
        `I'll post the result here once it's done. Use /board \`${boardId.slice(0, 8)}\` to check progress.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {})
      return
    }
  }

  const abortController = new AbortController()
  abortControllers.set(chatId, abortController)

  const timeoutMs = AGENT_TIMEOUT_MS
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const complexity = classifyComplexity(text)
    let result: { text: string; sessionId?: string }

    if (complexity === 'direct') {
      result = await respondDirect({ messages, chatId, signal: abortController.signal })
    } else {
      result = await runOrchestrator({ messages, chatId, signal: abortController.signal })
    }

    clearTimeout(timeoutId)
    isTypingActive = false
    abortControllers.delete(chatId)

    const responseText = result.text || 'No response generated.'

    insertTurn(chatId, 'user', text, 'main')
    insertTurn(chatId, 'assistant', responseText, 'main')
    chatEvents.emit('assistant_message', { chatId, agentId: 'main', data: responseText, timestamp: Date.now() })

    const parts = splitMessage(responseText)
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) await sleep(400)
      const replyOptions: any = { parse_mode: 'HTML' }
      if (ctx.message?.message_id) {
        replyOptions.reply_parameters = { message_id: ctx.message.message_id }
      }
      await ctx.reply(formatForTelegram(parts[i]), replyOptions).catch(() => {})
    }

    if (result.sessionId) {
      await ctx.reply(
        `📋 I'll track progress and report back when tasks complete. Use /status to check anytime.`
      ).catch(() => {})
    }

  } catch (err: unknown) {
    clearTimeout(timeoutId)
    isTypingActive = false
    abortControllers.delete(chatId)
    const msg = (err as Error).message
    const isAborted = abortController.signal.aborted
    const { category } = classifyError(err as Error)

    let userMsg: string
    if (isAborted && msg.toLowerCase().includes('abort')) {
      userMsg = '⏱ Request timed out. Try a simpler question or break it into smaller steps.'
    } else if (category === 'rate_limit') {
      userMsg = '⏳ Hit the API rate limit. Will retry automatically — try again in a moment.'
    } else if (category === 'overloaded') {
      userMsg = '🔄 Service is busy. Retrying in the background…'
    } else if (category === 'auth') {
      userMsg = '🔑 API key issue. Check OPENCODE_API_KEY in your .env file.'
    } else if (category === 'network') {
      userMsg = '📡 Network error. Check your internet connection.'
    } else {
      userMsg = `⚠️ ${msg.slice(0, 200)}`
    }

    logger.error({ chatId, err: msg }, 'Message handling failed')
    chatEvents.emit('error', { chatId, agentId: 'main', data: msg, message: msg, timestamp: Date.now() })
    await ctx.reply(userMsg).catch(() => {})
  }
}

function createKanbanBoardForAgent(chatId: string, agentId: string, prompt: string): string {
  const boardId = createKanbanBoard(
    `Task for ${agentId}: ${prompt.slice(0, 60)}`,
    undefined,
    3,
    chatId
  )
  const taskId = createKanbanTask(boardId, prompt.slice(0, 80), prompt, agentId, 3)
  setKanbanTaskStatus(taskId, 'running')
  return boardId
}
