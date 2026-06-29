import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const STORE_DIR = join(ROOT, 'store')
const PID_FILE = join(STORE_DIR, 'daemon.pid')
const DAEMON_SCRIPT = join(ROOT, 'daemon', 'server.js')
const WATCHDOG_PID_FILE = join(STORE_DIR, 'watchdog.pid')

const CHECK_INTERVAL_MS = 5000
const MAX_RESTART_INTERVAL_MS = 30000
const INITIAL_RESTART_DELAY_MS = 1000

export class Watchdog {
  constructor(options = {}) {
    this.daemonScript = options.daemonScript || DAEMON_SCRIPT
    this.pidFile = options.pidFile || PID_FILE
    this.watchdogPidFile = options.watchdogPidFile || WATCHDOG_PID_FILE
    this.storeDir = options.storeDir || STORE_DIR
    this.cwd = options.cwd || ROOT
    this.checkInterval = options.checkInterval || CHECK_INTERVAL_MS
    this.maxRestartInterval = options.maxRestartInterval || MAX_RESTART_INTERVAL_MS
    this.onStatusChange = options.onStatusChange || (() => {})

    this.daemonProcess = null
    this.restartCount = 0
    this.restartDelay = INITIAL_RESTART_DELAY_MS
    this.isRunning = false
    this._checkTimer = null

    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true })
    }

    writeFileSync(this.watchdogPidFile, String(process.pid), 'utf-8')
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this._spawnDaemon()
    this._startMonitoring()
    this.onStatusChange('watchdog_started', { pid: process.pid })
  }

  stop() {
    this.isRunning = false

    if (this._checkTimer) {
      clearInterval(this._checkTimer)
      this._checkTimer = null
    }

    if (this.daemonProcess) {
      this._killDaemon()
    }

    this.onStatusChange('watchdog_stopped', {})
  }

  getStatus() {
    return {
      running: this.isRunning,
      daemonPid: this.daemonProcess?.pid || null,
      restartCount: this.restartCount,
      restartDelay: this.restartDelay,
      uptime: this._startedAt ? Date.now() - this._startedAt : 0,
    }
  }

  resetBackoff() {
    this.restartDelay = INITIAL_RESTART_DELAY_MS
    this.restartCount = 0
  }

  _spawnDaemon() {
    const env = { ...process.env }

    this.daemonProcess = spawn('node', [this.daemonScript], {
      cwd: this.cwd,
      stdio: 'inherit',
      env,
      detached: false,
    })

    writeFileSync(this.pidFile, String(this.daemonProcess.pid), 'utf-8')
    this._startedAt = Date.now()

    this.onStatusChange('daemon_spawned', { pid: this.daemonProcess.pid })

    this.daemonProcess.on('exit', (code, signal) => {
      this.onStatusChange('daemon_exited', { code, signal, pid: this.daemonProcess?.pid })
      this.daemonProcess = null

      if (this.isRunning) {
        this._scheduleRestart()
      }
    })

    this.daemonProcess.on('error', (err) => {
      this.onStatusChange('daemon_error', { error: err.message })
    })
  }

  _startMonitoring() {
    this._checkTimer = setInterval(() => {
      this._checkDaemon()
    }, this.checkInterval)
  }

  _checkDaemon() {
    if (this.daemonProcess) {
      if (this.restartCount > 0 && this.restartDelay > INITIAL_RESTART_DELAY_MS) {
        this.restartDelay = Math.max(INITIAL_RESTART_DELAY_MS, this.restartDelay - 1000)
      }
    }
  }

  _scheduleRestart() {
    this.restartCount++

    this.restartDelay = Math.min(
      this.restartDelay * 2,
      this.maxRestartInterval
    )

    this.onStatusChange('daemon_restart_scheduled', {
      delay: this.restartDelay,
      restartCount: this.restartCount,
    })

    setTimeout(() => {
      if (this.isRunning && !this.daemonProcess) {
        this._spawnDaemon()
      }
    }, this.restartDelay)
  }

  _killDaemon() {
    if (!this.daemonProcess) return

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(this.daemonProcess.pid), '/F', '/T'])
      } else {
        this.daemonProcess.kill('SIGTERM')
        setTimeout(() => {
          if (this.daemonProcess) {
            try { this.daemonProcess.kill('SIGKILL') } catch {}
          }
        }, 5000)
      }
    } catch {}

    this.daemonProcess = null
  }
}

export default Watchdog
