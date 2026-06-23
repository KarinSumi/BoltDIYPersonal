#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { PROJECT_ROOT } from './config.js'
import yaml from 'js-yaml'

const rl = createInterface({ input: process.stdin, output: process.stdout })

interface AgentConfig {
  id: string
  name: string
  model: string
  personality: string
  cwd: string
  mcp_servers: string[]
}

async function ask(question: string, defaultVal?: string): Promise<string> {
  const result = await rl.question(`${question}${defaultVal ? ` (${defaultVal})` : ''}: `)
  return result.trim() || defaultVal || ''
}

async function main() {
  console.log('\n  OpenCode OS — Agent Creation Wizard\n')

  const id = await ask('Agent ID (lowercase, letters/numbers/hyphens, max 30 chars)')
  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(id)) {
    console.error('Invalid agent ID. Must start with a letter, lowercase, max 30 chars.')
    rl.close()
    process.exit(1)
  }

  const name = await ask('Display name', id)
  const model = await ask('Model', 'deepseek-v4-flash-free')
  const personality = await ask('Personality / system prompt', 'A helpful assistant.')
  const mcpServersInput = await ask('MCP servers (comma-separated)', 'Bash, Read, Write, Grep, Glob')

  const config: AgentConfig = {
    id,
    name,
    model,
    personality,
    cwd: '.',
    mcp_servers: mcpServersInput.split(',').map(s => s.trim()),
  }

  const agentDir = resolve(PROJECT_ROOT, 'agents', id)
  if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true })

  writeFileSync(join(agentDir, 'agent.yaml'), yaml.dump(config), 'utf-8')

  const templateMd = resolve(PROJECT_ROOT, 'agents', '_template', 'CLAUDE.md')
  const agentMdPath = join(agentDir, 'CLAUDE.md')
  if (existsSync(templateMd)) {
    let content = readFileSync(templateMd, 'utf-8')
    content = content.replace(/\{\{AGENT_NAME\}\}/g, name).replace(/\{\{PERSONALITY\}\}/g, personality)
    writeFileSync(agentMdPath, content, 'utf-8')
  }

  console.log(`\n✅ Agent "${name}" (${id}) created!`)
  console.log(`   Config: agents/${id}/agent.yaml`)
  console.log(`   System prompt: agents/${id}/CLAUDE.md`)

  rl.close()
}

main().catch(console.error)
