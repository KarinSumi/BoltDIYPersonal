import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PROJECT_ROOT } from './config.js'
import { insertHiveEntry } from './db.js'
import { v4 as uuid } from 'uuid'
import { load } from 'js-yaml'

export interface AgentConfig {
  id: string
  name: string
  model: string
  personality: string
  cwd: string
  mcpServers: string[]
  color?: string
}

const AGENT_COLORS = [
  '#E07A4F', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F0B27A', '#82E0AA', '#F1948A', '#85929E', '#73C6B6'
]

let colorIndex = 0
const agents = new Map<string, AgentConfig>()

export function registerAgent(config: AgentConfig): void {
  if (agents.size >= 20) throw new Error('Maximum 20 agents allowed')
  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(config.id)) throw new Error('Invalid agent ID format')
  config.color = assignColor()
  agents.set(config.id, config)
}

export function getAgent(id: string): AgentConfig | undefined {
  const externalPath = join(PROJECT_ROOT, 'agents', id, 'agent.yaml')
  if (existsSync(externalPath)) {
    try {
      const content = readFileSync(externalPath, 'utf-8')
      const cfg = load(content) as AgentConfig
      cfg.id = id
      cfg.color = assignColor()
      return cfg
    } catch { /* fallback */ }
  }
  return agents.get(id)
}

export function assignColor(): string {
  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]
  colorIndex++
  return color
}

export function listAgents(): AgentConfig[] {
  return Array.from(agents.values())
}

export function isDelegationRequest(text: string): { agentId: string; prompt: string } | null {
  const atMatch = text.match(/^@(\w[\w-]*):?\s(.+)/)
  if (atMatch) return { agentId: atMatch[1], prompt: atMatch[2] }

  const cmdMatch = text.match(/^\/delegate\s+(\w[\w-]*)\s+(.+)/)
  if (cmdMatch) return { agentId: cmdMatch[1], prompt: cmdMatch[2] }

  return null
}

export function activateAgent(id: string): boolean {
  if (!agents.has(id)) return false
  insertHiveEntry({ id: uuid(), agent_id: id, action: 'activated', summary: `Agent ${id} activated` })
  return true
}

export function deactivateAgent(id: string): boolean {
  if (!agents.has(id)) return false
  insertHiveEntry({ id: uuid(), agent_id: id, action: 'deactivated', summary: `Agent ${id} deactivated` })
  return agents.delete(id)
}

export function deleteAgent(id: string): boolean {
  return agents.delete(id)
}
