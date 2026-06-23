import { Bot, Context, InputFile } from 'grammy'
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID, MAX_MESSAGE_LENGTH, TYPING_REFRESH_MS, SHOW_COST_FOOTER } from './config.js'
import { queryAgent, AgentMessage, AgentResult } from './opencode-agent.js'
import { getSession, setSession, clearSession, insertTurn, getRecentTurns } from './db.js'
import { enqueue } from './message-queue.js'
import { formatCostFooter } from './cost-footer.js'
import { logger } from './logger.js'
import { voiceEnabledChats, chatEvents, abortControllers } from './state.js'

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

  bot.command('chatid', (ctx) => {
    ctx.reply(`Your chat ID: ${ctx.chat?.id ?? 'unknown'}`)
  })

  bot.command('newchat', (ctx) => {
    const chatId = String(ctx.chat!.id)
    clearSession(chatId)
    ctx.reply('Session cleared. Starting fresh.')
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
  const agentId = 'main'

  try {
    const sessionId = getSession(chatId, agentId)
    let systemPrompt = 'You are OpenCode OS, a personal AI assistant accessible via Telegram.\nRespond concisely and helpfully.'

    const recentTurns = getRecentTurns(chatId, agentId, 10) as Array<{ role: string; content: string }>
    const messages: AgentMessage[] = [
      ...recentTurns.reverse().map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: text }
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

    insertTurn(chatId, 'user', text, agentId)
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
