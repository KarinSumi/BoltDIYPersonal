import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { PROJECT_ROOT } from './config.js'
import { load } from 'js-yaml'

export interface AgentYamlConfig {
  id: string
  name: string
  model: string
  personality: string
  cwd?: string
  mcp_servers?: string[]
}

export function loadAgentConfig(agentId: string): AgentYamlConfig | null {
  const externalDir = process.env['OPENCODE_CONFIG'] || join(homedir(), '.opencode')
  const paths = [
    join(externalDir, 'agents', agentId, 'agent.yaml'),
    join(PROJECT_ROOT, 'agents', agentId, 'agent.yaml'),
  ]

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return load(readFileSync(p, 'utf-8')) as AgentYamlConfig
      } catch { return null }
    }
  }

  return null
}

export function resolveAgentDir(agentId: string): string {
  const config = loadAgentConfig(agentId)
  if (config?.cwd) return join(PROJECT_ROOT, config.cwd)
  return PROJECT_ROOT
}

export function resolveAgentClaudeMd(agentId: string): string {
  const externalDir = process.env['OPENCODE_CONFIG'] || join(homedir(), '.opencode')
  const paths = [
    join(externalDir, 'agents', agentId, 'CLAUDE.md'),
    join(PROJECT_ROOT, 'agents', agentId, 'CLAUDE.md'),
    join(PROJECT_ROOT, 'AGENTS.md'),
  ]

  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }

  return ''
}
