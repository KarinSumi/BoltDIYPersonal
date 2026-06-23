import { createInterface } from 'readline/promises'
import { writeFileSync, copyFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { PROJECT_ROOT } from './config.js'
import { load } from 'js-yaml'

const AGENT_ID_RE = /^[a-z][a-z0-9_-]{0,29}$/

export async function createAgentWizard(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  console.log('=== OpenCode OS Agent Creation Wizard ===\n')

  const id = await rl.question('Agent ID (lowercase, starts with letter, max 30 chars): ')
  if (!AGENT_ID_RE.test(id)) {
    console.error('Invalid agent ID. Must match /^[a-z][a-z0-9_-]{0,29}$/')
    rl.close()
    return
  }

  const name = await rl.question('Display name: ')
  const token = await rl.question('Telegram bot token (from @BotFather): ')

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await resp.json() as { ok: boolean }
    if (!data.ok) {
      console.error('Invalid Telegram bot token')
      rl.close()
      return
    }
  } catch {
    console.error('Could not validate token (network error)')
    rl.close()
    return
  }

  const personality = await rl.question('Personality description: ')
  const model = await rl.question('Model (default: deepseek-v4-flash-free): ') || 'deepseek-v4-flash-free'
  const cwd = await rl.question('Working directory (default: project root): ') || '.'

  const agentDir = join(PROJECT_ROOT, 'agents', id)
  if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true })

  const config = {
    id,
    name,
    model,
    personality,
    cwd,
    mcp_servers: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch']
  }

  writeFileSync(join(agentDir, 'agent.yaml'), JSON.stringify(config, null, 2))

  const templateMd = join(PROJECT_ROOT, 'agents', '_template', 'CLAUDE.md')
  if (existsSync(templateMd)) {
    copyFileSync(templateMd, join(agentDir, 'CLAUDE.md'))
  }

  appendFileSync(join(PROJECT_ROOT, '.env'), `\n${id.toUpperCase()}_TELEGRAM_TOKEN=${token}`)

  console.log(`\nAgent "${name}" (${id}) created successfully!`)
  console.log(`Files:`)
  console.log(`  - agents/${id}/agent.yaml`)
  console.log(`  - agents/${id}/CLAUDE.md`)
  console.log(`  - .env (${id.toUpperCase()}_TELEGRAM_TOKEN added)`)

  rl.close()
}
