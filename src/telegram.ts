import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID } from './config.js'
import { logger } from './logger.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseRetryAfter(resp: Response): number {
  const header = resp.headers.get('Retry-After')
  if (header) {
    const seconds = parseInt(header, 10)
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000
  }
  return 0
}

export async function sendTelegramMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
      })

      if (resp.ok) return true

      if (resp.status === 429) {
        const retryAfter = parseRetryAfter(resp) || (attempt + 1) * 5000
        logger.warn({ chatId, status: 429, retryAfterMs: retryAfter, attempt: attempt + 1 }, 'Telegram rate limited, retrying')
        await sleep(retryAfter)
        continue
      }

      if (resp.status >= 500) {
        logger.warn({ chatId, status: resp.status, attempt: attempt + 1 }, 'Telegram server error, retrying')
        await sleep((attempt + 1) * 3000)
        continue
      }

      const body = await resp.text().catch(() => '')
      logger.warn({ chatId, status: resp.status, body: body?.slice(0, 100) }, 'Telegram send failed (non-retryable)')
      return false
    } catch (err) {
      logger.error({ err: (err as Error).message, chatId, attempt: attempt + 1 }, 'Telegram send error, retrying')
      await sleep((attempt + 1) * 3000)
    }
  }

  logger.error({ chatId }, 'Telegram send failed after 3 retries')
  return false
}

export function getAllowedChatIds(): string[] {
  return ALLOWED_CHAT_ID
    ? ALLOWED_CHAT_ID.split(',').map(id => id.trim()).filter(Boolean)
    : []
}
