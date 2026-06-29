#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { spawn, execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const STORE_DIR = join(ROOT, 'store')
const PID_FILE = join(STORE_DIR, 'daemon.pid')
const VERSION_FILE = join(ROOT, 'VERSION')
const PACKAGE_JSON = join(ROOT, 'package.json')
const DAEMON_SCRIPT = join(ROOT, 'daemon', 'server.js')
const DAEMON_PORT = process.env.DAEMON_PORT || 8787

function readVersion() {
  if (existsSync(VERSION_FILE)) {
    return readFileSync(VERSION_FILE, 'utf-8').trim()
  }
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'))
    return pkg.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

function ensureStoreDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true })
  }
}

function getPid() {
  try {
    if (existsSync(PID_FILE)) {
      return parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
    }
  } catch {}
  return null
}

function authHeaders() {
  const token = process.env.OVERLAY_AUTH
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

function isRunning(pid) {
  if (!pid) return false
  try {
    if (process.platform === 'win32') {
      execSync(`tasklist /FI "PID eq ${pid}" 2>nul`, { stdio: 'ignore' })
      return true
    } else {
      process.kill(pid, 0)
      return true
    }
  } catch {
    return false
  }
}

async function fetchJson(url, headers = {}) {
  try {
    const resp = await fetch(url, { headers: { ...authHeaders(), ...headers } })
    return await resp.json()
  } catch {
    return null
  }
}

async function start() {
  ensureStoreDir()

  const pid = getPid()
  if (pid && isRunning(pid)) {
    console.log('OpenCode OS daemon is already running (PID:', pid + ')')
    return
  }

  console.log('Starting OpenCode OS daemon (with watchdog)...')

  const { Watchdog } = await import('../daemon/watchdog.js')
  const watchdog = new Watchdog({
    daemonScript: DAEMON_SCRIPT,
    pidFile: PID_FILE,
    cwd: ROOT,
    onStatusChange: (status, data) => {
      if (status === 'daemon_spawned') {
        console.log(`Daemon started (PID: ${data.pid})`)
      } else if (status === 'daemon_exited') {
        console.log(`Daemon exited (code: ${data.code}), restarting...`)
      }
    }
  })
  watchdog.start()
  global.__watchdog = watchdog
}

async function stop() {
  if (global.__watchdog) {
    global.__watchdog.stop()
    global.__watchdog = null
    try { writeFileSync(PID_FILE, '', 'utf-8') } catch {}
    console.log('Daemon stopped')
    return
  }

  const pid = getPid()
  if (!pid || !isRunning(pid)) {
    console.log('OpenCode OS daemon is not running')
    return
  }

  console.log(`Stopping daemon (PID: ${pid})...`)
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    if (existsSync(PID_FILE)) {
      writeFileSync(PID_FILE, '', 'utf-8')
    }
    console.log('Daemon stopped')
  } catch (err) {
    console.error('Failed to stop daemon:', err.message)
  }
}

async function restart() {
  await stop()
  await new Promise(r => setTimeout(r, 1000))
  await start()
}

async function status() {
  const pid = getPid()
  const running = pid && isRunning(pid)

  const info = {
    version: readVersion(),
    status: running ? 'running' : 'stopped',
    pid: running ? pid : null,
    uptime: null,
    agents: null,
    daemon_port: DAEMON_PORT,
  }

  if (running) {
    const health = await fetchJson(`http://127.0.0.1:${DAEMON_PORT}/api/health`)
    if (health) {
      info.uptime = health.uptime || null
      info.agents = health.agents || null
    }
  }

  const watchdogStatus = global.__watchdog?.getStatus()
  if (watchdogStatus) {
    info.watchdog = {
      restartCount: watchdogStatus.restartCount,
      restartDelay: watchdogStatus.restartDelay,
    }
  }

  const isJson = process.argv.includes('--json')
  if (isJson) {
    console.log(JSON.stringify(info, null, 2))
  } else {
    console.log(`OpenCode OS v${info.version}`)
    console.log(`Status: ${info.status === 'running' ? 'running' : 'stopped'}`)
    if (info.pid) console.log(`PID: ${info.pid}`)
    if (info.uptime) console.log(`Uptime: ${info.uptime}`)
    if (info.agents !== null) console.log(`Agents: ${info.agents}`)
    if (info.watchdog) console.log(`Watchdog restarts: ${info.watchdog.restartCount} (backoff: ${info.watchdog.restartDelay}ms)`)
  }
}

async function ask(message) {
  if (!message) {
    console.error('Usage: bagidea ask <message>')
    process.exit(1)
  }

  const resp = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, channel: 'cli' }),
  })

  if (resp.ok) {
    const data = await resp.json()
    console.log(data.response || data.text || 'No response')
  } else {
    console.error('Error:', resp.status, resp.statusText)
  }
}

async function agents() {
  const data = await fetchJson(`http://127.0.0.1:${DAEMON_PORT}/api/agents`)
  if (!data) {
    console.error('Could not connect to daemon')
    return
  }

  const list = Array.isArray(data) ? data : (data.agents || [])

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(list, null, 2))
  } else {
    console.log(`Agents (${list.length}):`)
    for (const a of list) {
      console.log(`  ${a.id || a.name || '?'} \u2014 ${a.role || a.personality || ''}`)
    }
  }
}

async function projects() {
  const data = await fetchJson(`http://127.0.0.1:${DAEMON_PORT}/api/projects`)
  if (!data) {
    console.error('Could not connect to daemon')
    return
  }

  const list = Array.isArray(data) ? data : (data.projects || [])
  console.log(`Projects (${list.length}):`)
  for (const p of list) {
    const status = p.occupiedBy ? 'occupied' : 'free'
    console.log(`  ${p.name} \u2014 ${p.path} [${status}]`)
  }
}

async function plugins() {
  const data = await fetchJson(`http://127.0.0.1:${DAEMON_PORT}/api/plugins`)
  if (!data) {
    console.error('Could not connect to daemon')
    return
  }

  const list = Array.isArray(data) ? data : (data.plugins || [])
  console.log(`Plugins (${list.length}):`)
  for (const p of list) {
    console.log(`  ${p.name || p.id || '?'} \u2014 ${p.description || ''}`)
  }
}

async function installPlugin(url) {
  if (!url) {
    console.error('Usage: bagidea plugins install <github-url>')
    process.exit(1)
  }

  const resp = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/plugins/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ url }),
  })

  if (resp.ok) {
    const data = await resp.json()
    console.log(`Plugin installed: ${data.name || data.id || url}`)
  } else {
    console.error('Install failed:', resp.status, resp.statusText)
  }
}

async function update() {
  console.log('Checking for updates...')
  const { selfUpdate } = await import('./updater.js')
  try {
    const result = await selfUpdate({ repoRoot: ROOT })
    if (result.updated) {
      console.log(`Updated to v${result.version}`)
    } else {
      console.log(`Already up-to-date (v${result.currentVersion})`)
    }
  } catch (err) {
    console.error('Update failed:', err.message)
  }
}

async function main() {
  const command = process.argv[2] || 'help'

  switch (command) {
    case 'start': await start(); break
    case 'stop': await stop(); break
    case 'restart': await restart(); break
    case 'status': await status(); break
    case 'ask': await ask(process.argv.slice(3).join(' ')); break
    case 'agents': await agents(); break
    case 'projects': await projects(); break
    case 'plugins':
      if (process.argv[3] === 'install') await installPlugin(process.argv[4])
      else await plugins()
      break
    case 'update': await update(); break
    case 'version':
      console.log(readVersion())
      break
    default:
      console.log(`OpenCode OS CLI v${readVersion()}`)
      console.log('')
      console.log('Usage:')
      console.log('  bagidea start              Start the daemon')
      console.log('  bagidea stop               Stop the daemon')
      console.log('  bagidea restart            Restart the daemon')
      console.log('  bagidea status [--json]    Show daemon status')
      console.log('  bagidea ask <message>      Send a message')
      console.log('  bagidea agents [--json]    List agents')
      console.log('  bagidea projects           List projects')
      console.log('  bagidea plugins            List plugins')
      console.log('  bagidea plugins install    Install a plugin')
      console.log('  bagidea update             Self-update')
      console.log('  bagidea version            Show version')
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
