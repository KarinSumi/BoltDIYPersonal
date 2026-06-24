#!/usr/bin/env tsx
import { createInterface } from 'readline/promises'
import { writeFileSync, existsSync, readFileSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(PROJECT_ROOT, '.env')
const ENV_EXAMPLE_PATH = resolve(PROJECT_ROOT, '.env.example')

const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

function ok(msg: string) { console.log(`${GREEN}✓${RESET} ${msg}`) }
function warn(msg: string) { console.log(`${YELLOW}⚠${RESET} ${msg}`) }
function err(msg: string) { console.log(`${RED}✗${RESET} ${msg}`) }

const rl = createInterface({ input: process.stdin, output: process.stdout })

async function ask(question: string, defaultVal?: string): Promise<string> {
  const result = await rl.question(`${question}${defaultVal ? ` (${defaultVal})` : ''}: `)
  return result.trim() || defaultVal || ''
}

async function main() {
  console.log(`
  ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔════╝ ██╔══██╗██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║  ███╗██████╔╝█████╗  ██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝
 ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
  ██████╗ ███████╗
 ██╔═══██╗██╔════╝
 ██║   ██║███████╗
 ██║   ██║╚════██║
 ╚██████╔╝███████║
  ╚═════╝ ╚══════╝
  `)

  console.log('OpenCode OS Setup Wizard\n')

  // Check requirements
  console.log('Checking requirements...')
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim()
    const major = parseInt(nodeVersion.slice(1).split('.')[0])
    if (major >= 20) ok(`Node.js ${nodeVersion}`)
    else err(`Node.js ${nodeVersion} (need >= 20)`)
  } catch {
    err('Node.js not found')
  }

  // Collect config
  console.log('\n--- Configuration ---')

  const token = await ask('Telegram bot token (from @BotFather)', process.env.TELEGRAM_BOT_TOKEN)
  const chatId = await ask('Your Telegram chat ID (send /chatid after setup)', process.env.ALLOWED_CHAT_ID)
  const apiKey = await ask('OpenCode API key (for model access)', process.env.OPENCODE_API_KEY)
  const apiBase = await ask('OpenCode API base URL', process.env.OPENCODE_API_BASE_URL || 'https://api.deepseek.com')
  const model = await ask('Model name', process.env.OPENCODE_MODEL || 'deepseek-v4-flash-free')

  // Write .env
  let envContent = `# OpenCode OS
TELEGRAM_BOT_TOKEN=${token}
ALLOWED_CHAT_ID=${chatId}
OPENCODE_API_KEY=${apiKey}
OPENCODE_API_BASE_URL=${apiBase}
OPENCODE_MODEL=${model}
`

  const addGoogle = await ask('Add Google API key for Memory v2? (y/n)', 'n')
  if (addGoogle.toLowerCase() === 'y') {
    const googleKey = await ask('Google API key (from aistudio.google.com)')
    envContent += `\n# Memory v2\nGOOGLE_API_KEY=${googleKey}\n`
  }

  const addVoice = await ask('Add voice features? (y/n)', 'n')
  if (addVoice.toLowerCase() === 'y') {
    const groq = await ask('Groq API key (for STT, free at console.groq.com)')
    const eleven = await ask('ElevenLabs API key (for TTS, free at elevenlabs.io)')
    const elevenVoice = await ask('ElevenLabs voice ID')
    envContent += `\n# Voice\nGROQ_API_KEY=${groq}\nELEVENLABS_API_KEY=${eleven}\nELEVENLABS_VOICE_ID=${elevenVoice}\n`
  }

  const addDashboard = await ask('Add Dashboard? (y/n)', 'n')
  if (addDashboard.toLowerCase() === 'y') {
    const crypto = await import('crypto')
    const dashToken = crypto.randomBytes(24).toString('hex')
    envContent += `\n# Dashboard\nDASHBOARD_TOKEN=${dashToken}\nDASHBOARD_PORT=3141\n`
    ok(`Dashboard token: ${dashToken}`)
  }

  writeFileSync(ENV_PATH, envContent)
  ok('.env file created')

  // PM2 setup
  console.log('\n--- Service Installation ---')
  const addService = await ask('Install as PM2 service? (y/n)', 'n')
  if (addService.toLowerCase() === 'y') {
    try {
      execSync('pm2 --version', { encoding: 'utf-8' })
      execSync(`pm2 start ${resolve(PROJECT_ROOT, 'dist', 'index.js')} --name opencode-os`, { cwd: PROJECT_ROOT })
      execSync('pm2 save', { cwd: PROJECT_ROOT })
      ok('PM2 service installed')
    } catch {
      warn('PM2 not found. Install with: npm install -g pm2')
      console.log('Then run: pm2 start dist/index.js --name opencode-os')
    }
  }

  console.log('\n--- Setup Complete ---')
  ok('Configuration saved')
  console.log('\nNext steps:')
  console.log('  1. Run: npm run build')
  console.log('  2. Run: npm start')
  console.log('  3. Send /chatid to your Telegram bot')
  console.log('  4. Add the chat ID to .env')
  console.log('')

  rl.close()
}

main().catch(console.error)
