import { Bot, Context, InputFile } from 'grammy'
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID, MAX_MESSAGE_LENGTH, TYPING_REFRESH_MS, SHOW_COST_FOOTER } from './config.js'
import { queryAgent, AgentMessage, AgentResult } from './opencode-agent.js'
import { getSession, setSession, clearSession, insertTurn, getRecentTurns } from './db.js'
import { enqueue } from './message-queue.js'
import { formatCostFooter } from './cost-footer.js'
import { logger } from './logger.js'
import { voiceEnabledChats, chatEvents, abortControllers } from './state.js'
import { isDelegationRequest, getAgent, listAgents } from './orchestrator.js'
import { isLocked, lock, unlock, checkKillPhrase, resetIdleTimer } from './security.js'
import { touchActivity } from './state.js'
import { insertScheduledTask, insertMission, listScheduledTasks, listMissions } from './db.js'
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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

function getTypingIndicator(ctx: Context): ReturnType<typeof setInterval> | null {
  if (!ctx.chat?.id) return null
  return setInterval(() => {
    ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => {})
  }, TYPING_REFRESH_MS)
}

export function createBot(): Bot {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error('TELEGRAM_BOT_TOKEN is not set')
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN)

  bot.command('start', (ctx) => {
    ctx.reply('OpenCode OS is running. Send me a message!')
  })

  bot.command('help', (ctx) => {
    ctx.reply(
      'Available commands:\n' +
      '/chatid — Show your chat ID\n' +
      '/newchat — Clear conversation history\n' +
      '/agents — List available agents\n' +
      '/pin <code> — Lock the system with a PIN\n' +
      '/lock — Lock the system immediately\n' +
      '/voice — Toggle voice replies\n' +
      '/help — Show this message\n\n' +
      'Use @agentname <message> to delegate to a specific agent.'
    )
  })

  bot.command('chatid', (ctx) => {
    ctx.reply(`Your chat ID: ${ctx.chat?.id ?? 'unknown'}`)
  })

  bot.command('newchat', (ctx) => {
    const chatId = String(ctx.chat!.id)
    clearSession(chatId)
    ctx.reply('Session cleared. Starting fresh.')
  })

  bot.command('agents', (ctx) => {
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
    const code = ctx.match?.trim()
    if (!code) {
      ctx.reply('Usage: /pin <code>')
      return
    }
    const chatId = String(ctx.chat!.id)
    const unlocked = unlock(code)
    if (unlocked) {
      touchActivity()
      resetIdleTimer()
      ctx.reply('System unlocked.')
    } else {
      ctx.reply('Invalid PIN.')
    }
  })

  bot.command('task', (ctx) => {
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
      id: uuid(),
      agent_id: agentId,
      chat_id: chatId,
      prompt,
      schedule: 'once',
      next_run: tomorrow,
    })
    ctx.reply(`Task created for agent "${agentId}". Will run in ~1 minute. Check /status later.`)
  })

  bot.command('mission', (ctx) => {
    const parts = ctx.match?.trim().split(/\s+/)
    if (!parts || parts.length < 2) {
      ctx.reply('Usage: /mission <title> | <prompt>\nExample: /mission Health Check | Run diagnostics')
      return
    }
    const sep = ctx.match!.indexOf('|')
    let title: string
    let prompt: string
    if (sep !== -1) {
      title = ctx.match!.slice(0, sep).trim()
      prompt = ctx.match!.slice(sep + 1).trim()
    } else {
      title = parts[0]
      prompt = parts.slice(1).join(' ')
    }
    insertMission({ id: uuid(), title, prompt, priority: 0 })
    ctx.reply(`Mission "${title}" created and queued.`)
  })

  bot.command('status', (ctx) => {
    const tasks = listScheduledTasks() as Array<{ id: string; prompt: string; agent_id: string; status: string; next_run: string }>
    const missions = listMissions() as Array<{ id: string; title: string; status: string; priority: number }>
    let msg = ''
    if (tasks.length > 0) {
      msg += '**Scheduled Tasks:**\n' + tasks.slice(0, 5).map(t =>
        `\u2022 ${t.prompt.slice(0, 60)} [${t.agent_id}] — ${t.status}`
      ).join('\n') + '\n\n'
    }
    if (missions.length > 0) {
      msg += '**Missions:**\n' + missions.slice(0, 5).map(m =>
        `\u2022 ${m.title} — ${m.status}`
      ).join('\n')
    }
    ctx.reply(msg || 'No tasks or missions yet.')
  })

  bot.command('lock', (ctx) => {
    lock()
    ctx.reply('System locked. Send your PIN to unlock.')
  })

  bot.command('voice', (ctx) => {
    const chatId = String(ctx.chat!.id)
    if (voiceEnabledChats.has(chatId)) {
      voiceEnabledChats.delete(chatId)
      ctx.reply('Voice replies disabled.')
    } else {
      voiceEnabledChats.add(chatId)
      ctx.reply('Voice replies enabled.')
    }
  })

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat!.id)
    const text = ctx.message.text

    if (!isAuthorised(chatId)) {
      ctx.reply('Unauthorised. Check ALLOWED_CHAT_ID in your .env.')
      return
    }

    if (checkKillPhrase(text)) {
      return
    }

    if (isLocked()) {
      const unlocked = unlock(text)
      if (unlocked) {
        touchActivity()
        resetIdleTimer()
        await ctx.reply('System unlocked. Send your message again.')
      } else {
        await ctx.reply('\u26a0 System is locked. Enter your PIN to unlock.')
      }
      return
    }

    if (text.startsWith('/')) {
      await ctx.reply('Unknown command. Type /help for available commands.')
      return
    }

    if (INJECTION_PATTERNS.some(p => p.test(text))) {
      logger.warn({ chatId, text }, 'Prompt injection attempt blocked')
      await ctx.reply('Message rejected.')
      return
    }

    touchActivity()
    resetIdleTimer()

    await enqueue(chatId, async () => {
      await handleTextMessage(ctx, chatId, text)
    })
  })

  return bot
}

function isAuthorised(chatId: string): boolean {
  if (!ALLOWED_CHAT_ID) return true
  return ALLOWED_CHAT_ID.split(',').map(id => id.trim()).includes(chatId)
}

async function handleTextMessage(ctx: Context, chatId: string, text: string): Promise<void> {
  const typingInterval = getTypingIndicator(ctx)
  let agentId = 'main'
  let promptText = text

  const delegation = isDelegationRequest(text)
  if (delegation) {
    agentId = delegation.agentId
    promptText = delegation.prompt
  }

  try {
    const sessionId = getSession(chatId, agentId)
    let systemPrompt = 'You are OpenCode OS, a personal AI assistant accessible via Telegram.\nRespond concisely and helpfully.'
    const agentCfg = getAgent(agentId)
    if (agentCfg) {
      systemPrompt = agentCfg.personality
    }

    const recentTurns = getRecentTurns(chatId, agentId, 10) as Array<{ role: string; content: string }>
    const messages: AgentMessage[] = [
      ...recentTurns.reverse().map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: promptText }
    ]

    chatEvents.emit('user_message', { chatId, agentId, data: text, timestamp: Date.now() })

    const abortController = new AbortController()
    abortControllers.set(chatId, abortController)

    const result: AgentResult = await queryAgent({
      messages,
      sessionId,
      agentId,
      systemPrompt,
    })

    abortControllers.delete(chatId)

    const responseText = result.text || 'No response generated.'
    const footer = formatCostFooter(result.model || 'unknown', result.inputTokens || 0, result.outputTokens || 0, SHOW_COST_FOOTER)

    const finalText = footer ? `${responseText}\n\n${footer}` : responseText

    insertTurn(chatId, 'user', promptText, agentId)
    insertTurn(chatId, 'assistant', responseText, agentId)

    chatEvents.emit('assistant_message', { chatId, agentId, data: responseText, timestamp: Date.now() })

    clearInterval(typingInterval!)

    const parts = splitMessage(finalText)
    for (const part of parts) {
      await ctx.reply(formatForTelegram(part), { parse_mode: 'HTML' })
    }

  } catch (err: unknown) {
    clearInterval(typingInterval!)
    const msg = (err as Error).message
    logger.error({ chatId, err: msg }, 'Message handling failed')
    chatEvents.emit('error', { chatId, agentId, data: msg, timestamp: Date.now() })
    ctx.reply(`Error: ${msg}`).catch(() => {})
  }
}
