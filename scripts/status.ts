#!/usr/bin/env tsx
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { readEnvFile } from '../src/env.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`) }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`) }

async function main() {
  console.log('\n  OpenCode OS — Status Check\n')

  // Node version
  try {
    const nodeVer = execSync('node --version', { encoding: 'utf-8' }).trim()
    const major = parseInt(nodeVer.slice(1).split('.')[0])
    if (major >= 20) ok(`Node.js ${nodeVer}`)
    else fail(`Node.js ${nodeVer} (need >= 20)`)
  } catch {
    fail('Node.js not found')
  }

  // .env file
  const envPath = resolve(PROJECT_ROOT, '.env')
  if (existsSync(envPath)) {
    ok('.env file exists')
    const env = readEnvFile()

    if (env.TELEGRAM_BOT_TOKEN) ok('Telegram token configured')
    else fail('Telegram token missing')

    if (env.ALLOWED_CHAT_ID) ok(`Chat ID: ${env.ALLOWED_CHAT_ID}`)
    else warn('Chat ID not configured (first-run mode)')

    if (env.OPENCODE_API_KEY) ok('API key configured')
    else fail('API key missing')

    if (env.GOOGLE_API_KEY) ok('Google API key configured (Memory v2)')
    if (env.GROQ_API_KEY) ok('Groq API key configured (Voice STT)')
    if (env.ELEVENLABS_API_KEY) ok('ElevenLabs API key configured (Voice TTS)')
    if (env.DASHBOARD_TOKEN) ok('Dashboard token configured')
  } else {
    fail('.env file not found')
  }

  // Database
  const dbPath = resolve(PROJECT_ROOT, 'store', 'opencode.sqlite')
  if (existsSync(dbPath)) {
    ok('Database exists')
    try {
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(dbPath)
      const count = db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }
      ok(`Memory entries: ${count.c}`)
      db.close()
    } catch { /* ignore */ }
  } else {
    warn('Database not initialized (run the bot first)')
  }

  // PM2
  try {
    const pm2List = execSync('pm2 jlist', { encoding: 'utf-8' })
    const processes = JSON.parse(pm2List) as Array<{ name: string; pm2_env: { status: string } }>
    const opencode = processes.find((p: { name: string }) => p.name === 'opencode-os')
    if (opencode) {
      ok(`PM2 service: ${opencode.pm2_env.status}`)
    } else {
      warn('PM2 service not running')
    }
  } catch {
    warn('PM2 not available')
  }

  // Build
  const distPath = resolve(PROJECT_ROOT, 'dist', 'index.js')
  if (existsSync(distPath)) ok('Build exists (dist/index.js)')
  else warn('Not built yet (run: npm run build)')

  console.log('')
}

main().catch(console.error)
