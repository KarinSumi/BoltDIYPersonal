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
import { sendTelegramMessage, getAllowedChatIds } from './telegram.js'
import { startOpenCodeServer, stopOpenCodeServer } from './opencode-server.js'
import { logger } from './logger.js'

const PID_FILE = join(STORE_DIR, 'opencode.pid')

async function acquireLock(): Promise<void> {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })

  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim())
      process.kill(oldPid, 0)
      process.kill(oldPid, 'SIGTERM')
      logger.info({ oldPid }, 'Killed stale process, waiting for it to exit...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch { /* stale pid */ }
  }

  writeFileSync(PID_FILE, String(process.pid))
}

function releaseLock(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE)
    }
  } catch { /* ignore */ }
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
  if (process.env.DEBUG) console.log('entering main')
  printBanner()
  if (process.env.DEBUG) console.log('passed printBanner')

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('No bot token')
    process.exit(1)
  }

  if (!ALLOWED_CHAT_ID) {
    logger.warn('ALLOWED_CHAT_ID not set. First run mode — any chat ID can access the bot.')
    console.warn('\n⚠ ALLOWED_CHAT_ID not set. Send /chatid to the bot after startup to get your ID.')
  }
  
  if (process.env.DEBUG) console.log('acquiring lock')
  await acquireLock()
  if (process.env.DEBUG) console.log('lock acquired')

  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true })

  if (process.env.DEBUG) console.log('initDatabase')
  initDatabase()
  if (process.env.DEBUG) console.log('registerMainAgent')
  registerMainAgent()
  if (process.env.DEBUG) console.log('resetIdleTimer')
  resetIdleTimer()
  if (process.env.DEBUG) console.log('setShutdownHandler')
  setShutdownHandler(gracefulShutdown)

  runSalienceDecay()
  setInterval(() => runSalienceDecay(), 86400000)

  if (process.env.DEBUG) console.log('start core systems')
  startDispatcher()
  startKanbanWorker()
  startProgressReporter()
  startHeartbeat()

  // Start OpenCode server for deep coding tasks (non-blocking)
  if (process.env.DEBUG) console.log('starting OpenCode server')
  startOpenCodeServer().then((ready) => {
    if (ready) {
      logger.info('OpenCode server available for deep tasks')
      if (process.env.DEBUG) console.log('  ✓ OpenCode server ready (deep tasks enabled)')
    } else {
      logger.info('OpenCode unavailable — deep tasks will use NIM LLM')
    }
  }).catch((err) => {
    logger.warn({ err: (err as Error).message }, 'OpenCode server startup error (non-fatal)')
  })

  if (process.env.DEBUG) console.log('createBot')
  const bot = createBot()

  startDashboard()

  initScheduler(async (chatId: string, text: string) => {
    await sendTelegramMessage(chatId, text, 'HTML')
  })

  try {
    bot.start()
    logger.info('OpenCode OS is running')
    if (process.env.DEBUG) console.log('\n✓ OpenCode OS is running!')
    if (process.env.DEBUG) console.log('  Send a message to your Telegram bot to begin.\n')

    const chatIds = getAllowedChatIds()
    for (const chatId of chatIds) {
      sendTelegramMessage(chatId, '✅ Terminate previous server, and Restart server done').catch(e => {
        logger.warn({ err: e.message }, 'Failed to send startup message')
      })
    }

    if (process.send) {
      process.send('ready')
    }

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
  stopOpenCodeServer()
  releaseLock()
  try { getDb().close() } catch { /* ok */ }
  logger.info('Graceful shutdown complete')
}

main().catch((err) => {
  console.error('FATAL ERROR:', err)
  logger.error({ err }, 'Fatal error')
  releaseLock()
  process.exit(1)
})
