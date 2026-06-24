import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PROJECT_ROOT, TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID } from './config.js'
import { STORE_DIR, UPLOADS_DIR } from './config.js'
import { initDatabase, runSalienceDecay } from './db.js'
import { createBot } from './bot.js'
import { startDashboard } from './dashboard.js'
import { initScheduler } from './scheduler.js'
import { registerMainAgent } from './orchestrator.js'
import { resetIdleTimer } from './security.js'
import { startConsolidationLoop } from './memory-consolidate.js'
import { logger } from './logger.js'

const PID_FILE = join(STORE_DIR, 'opencode.pid')

function acquireLock(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })

  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim())
      process.kill(oldPid, 0)
      process.kill(oldPid, 'SIGTERM')
      logger.info({ oldPid }, 'Killed stale process')
      setTimeout(() => {}, 1000)
    } catch { /* stale pid */ }
  }

  writeFileSync(PID_FILE, String(process.pid))
}

function releaseLock(): void {
  try { unlinkSync(PID_FILE) } catch { /* ignore */ }
}

function printBanner(): void {
  console.log(`
  ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝
 ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
              OpenCode OS — Personal AI Assistant
`)
}

async function main(): Promise<void> {
  printBanner()

  if (!TELEGRAM_BOT_TOKEN) {
    logger.error('TELEGRAM_BOT_TOKEN is not set. Create a .env file with your bot token.')
    console.error('\n✗ TELEGRAM_BOT_TOKEN is required.')
    console.error('  Create a .env file with: TELEGRAM_BOT_TOKEN=your_token_here')
    console.error('  Get a token from @BotFather on Telegram.')
    process.exit(1)
  }

  if (!ALLOWED_CHAT_ID) {
    logger.warn('ALLOWED_CHAT_ID not set. First run mode — any chat ID can access the bot.')
    console.warn('\n⚠ ALLOWED_CHAT_ID not set. Send /chatid to the bot after startup to get your ID.')
  }

  acquireLock()

  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true })

  initDatabase()
  registerMainAgent()
  resetIdleTimer()

  runSalienceDecay()
  setInterval(() => runSalienceDecay(), 86400000)

  const bot = createBot()

  startDashboard()

  initScheduler(async (chatId: string, text: string) => {
    try {
      await (await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
      })).json()
    } catch (err) {
      logger.error({ err, chatId }, 'Failed to send scheduler notification')
    }
  })

  try {
    bot.start()
    logger.info('OpenCode OS is running')
    console.log('\n✓ OpenCode OS is running!')
    console.log('  Send a message to your Telegram bot to begin.\n')

    process.on('SIGINT', () => { releaseLock(); process.exit(0) })
    process.on('SIGTERM', () => { releaseLock(); process.exit(0) })
  } catch (err) {
    releaseLock()
    logger.error({ err }, 'Failed to start bot')
    console.error(`\n✗ Failed to start bot: ${(err as Error).message}`)
    console.error('  Check TELEGRAM_BOT_TOKEN in your .env file.')
    process.exit(1)
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  releaseLock()
  process.exit(1)
})
