import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PROJECT_ROOT, TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID } from './config.js'
import { STORE_DIR, UPLOADS_DIR } from './config.js'
import { initDatabase, getDb, runSalienceDecay } from './db.js'
import { createBot } from './bot.js'
import { startDashboard } from './dashboard.js'
import { initScheduler } from './scheduler.js'
import { registerMainAgent } from './orchestrator.js'
import { resetIdleTimer, setShutdownHandler } from './security.js'
import { startDispatcher, stopDispatcher } from './dispatcher.js'
import { startKanbanWorker, stopKanbanWorker } from './kanban-worker.js'
import { startProgressReporter, stopProgressReporter } from './progress-reporter.js'
import { startHeartbeat, stopHeartbeat } from './heartbeat.js'
import { sendTelegramMessage } from './telegram.js'
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

process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack?.split('\n').slice(0, 4).join('\n') }, 'Uncaught exception')
})

process.on('unhandledRejection', (reason) => {
  logger.error({ err: String(reason) }, 'Unhandled rejection')
})

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
  setShutdownHandler(gracefulShutdown)

  runSalienceDecay()
  setInterval(() => runSalienceDecay(), 86400000)

  startDispatcher()
  startKanbanWorker()
  startProgressReporter()
  startHeartbeat()

  const bot = createBot()

  startDashboard()

  initScheduler(async (chatId: string, text: string) => {
    await sendTelegramMessage(chatId, text, 'HTML')
  })

  try {
    bot.start()
    logger.info('OpenCode OS is running')
    console.log('\n✓ OpenCode OS is running!')
    console.log('  Send a message to your Telegram bot to begin.\n')

    process.on('SIGINT', () => { gracefulShutdown(); process.exit(0) })
    process.on('SIGTERM', () => { gracefulShutdown(); process.exit(0) })
  } catch (err) {
    releaseLock()
    logger.error({ err }, 'Failed to start bot')
    console.error(`\n✗ Failed to start bot: ${(err as Error).message}`)
    console.error('  Check TELEGRAM_BOT_TOKEN in your .env file.')
    process.exit(1)
  }
}

function gracefulShutdown(): void {
  stopDispatcher()
  stopKanbanWorker()
  stopProgressReporter()
  stopHeartbeat()
  releaseLock()
  try { getDb().close() } catch { /* ok */ }
  logger.info('Graceful shutdown complete')
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  releaseLock()
  process.exit(1)
})
