import { spawn, spawnSync, ChildProcess, execSync } from 'child_process'
import { OPENCODE_SERVER_PORT, OPENCODE_SERVER_ENABLED } from './config.js'
import { logger } from './logger.js'

let serverProcess: ChildProcess | null = null
let serverReady = false

export function getOpenCodeBaseURL(): string {
  return `http://127.0.0.1:${OPENCODE_SERVER_PORT}`
}

export function isOpenCodeServerReady(): boolean {
  return serverReady && OPENCODE_SERVER_ENABLED
}

export function isOpenCodeInstalled(): boolean {
  try {
    const result = spawnSync('opencode', ['--version'], {
      stdio: 'ignore',
      timeout: 5000,
      shell: process.platform === 'win32',
    })
    return result.status === 0
  } catch {
    return false
  }
}

export async function startOpenCodeServer(): Promise<boolean> {
  if (process.env.DEBUG) console.log('startOpenCodeServer: start')
  if (!OPENCODE_SERVER_ENABLED) {
    logger.info('OpenCode server disabled via OPENCODE_SERVER_ENABLED=false')
    return false
  }

  if (process.env.DEBUG) console.log('startOpenCodeServer: checking if installed')
  if (!isOpenCodeInstalled()) {
    logger.warn('opencode CLI not found. Deep tasks will fall back to NIM. Install with: npm i -g opencode-ai')
    return false
  }

  if (process.env.DEBUG) console.log('startOpenCodeServer: checked if installed')
  if (serverReady) {
    logger.info('OpenCode server already running')
    return true
  }

  if (process.env.DEBUG) console.log('startOpenCodeServer: returning promise')
  return new Promise((resolve) => {
    logger.info({ port: OPENCODE_SERVER_PORT }, 'Starting OpenCode server...')

    serverProcess = spawn('opencode', ['serve', '--port', String(OPENCODE_SERVER_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: process.platform === 'win32',
    })

    const readyTimer = setTimeout(() => {
      if (!serverReady) {
        // Assume up after 10s even without confirmation message
        serverReady = true
        logger.info({ port: OPENCODE_SERVER_PORT }, 'OpenCode server assumed ready (10s timeout)')
        resolve(true)
      }
    }, 10000)

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      logger.debug({ text }, 'OpenCode server stdout')
      if (!serverReady && (
        text.includes('listening') ||
        text.includes('started') ||
        text.includes(String(OPENCODE_SERVER_PORT))
      )) {
        clearTimeout(readyTimer)
        serverReady = true
        logger.info({ port: OPENCODE_SERVER_PORT }, 'OpenCode server ready')
        resolve(true)
      }
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text.length > 0) {
        logger.debug({ text }, 'OpenCode server stderr')
      }
    })

    serverProcess.on('error', (err) => {
      clearTimeout(readyTimer)
      logger.error({ err: err.message }, 'OpenCode server process error')
      serverReady = false
      serverProcess = null
      resolve(false)
    })

    serverProcess.on('exit', (code) => {
      logger.warn({ code }, 'OpenCode server exited unexpectedly')
      serverReady = false
      serverProcess = null
    })
  })
}

export function stopOpenCodeServer(): void {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM')
    } catch {
      // Already dead
    }
    serverProcess = null
    serverReady = false
    logger.info('OpenCode server stopped')
  }
}
