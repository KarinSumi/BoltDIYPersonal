import { readFileSync, existsSync, readdirSync } from 'fs'
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
  capabilities?: string[]
}

const AGENT_COLORS = [
  '#E07A4F', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F0B27A', '#82E0AA', '#F1948A', '#85929E', '#73C6B6'
]

let colorIndex = 0
const agents = new Map<string, AgentConfig>()
const diskAgentCache = new Map<string, AgentConfig>()
let catalogCache: Array<{ id: string; name: string; capabilities: string[] }> | null = null

function assignColor(): string {
  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]
  colorIndex++
  return color
}

function loadYamlAgent(agentId: string): AgentConfig | undefined {
  const path = join(PROJECT_ROOT, 'agents', agentId, 'agent.yaml')
  if (!existsSync(path)) return undefined
  try {
    const content = readFileSync(path, 'utf-8')
    const cfg = load(content) as AgentConfig
    cfg.id = agentId
    cfg.color = assignColor()
    return cfg
  } catch {
    return undefined
  }
}

function scanAndCacheAgents(): void {
  diskAgentCache.clear()
  catalogCache = null
  const dir = join(PROJECT_ROOT, 'agents')
  if (!existsSync(dir)) return

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_template') continue
    const cfg = loadYamlAgent(entry.name)
    if (cfg) {
      diskAgentCache.set(cfg.id, cfg)
    }
    scanSubAgents(entry.name)
  }
}

function scanSubAgents(parentId: string): void {
  const dir = join(PROJECT_ROOT, 'agents', parentId)
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_template') continue
    const agentId = `${parentId}/${entry.name}`
    const cfg = loadYamlAgent(agentId)
    if (cfg) {
      diskAgentCache.set(cfg.id, cfg)
    }
  }
}

export function getAgent(id: string): AgentConfig | undefined {
  const disk = diskAgentCache.get(id)
  if (disk) return disk

  const parentId = id.split('/')[0]
  const parent = diskAgentCache.get(parentId)
  if (parent) return parent

  return agents.get(id)
}

export function registerAgent(config: AgentConfig): void {
  if (agents.size >= 20) throw new Error('Maximum 20 agents allowed')
  if (!/^[a-z][a-z0-9/_-]{0,39}$/.test(config.id)) throw new Error('Invalid agent ID format')
  config.color = assignColor()
  agents.set(config.id, config)
}

export function listAgents(): AgentConfig[] {
  const result = Array.from(agents.values())
  for (const cfg of diskAgentCache.values()) {
    if (!result.find(a => a.id === cfg.id)) {
      result.push(cfg)
    }
  }
  return result
}

export function buildAgentCatalog(): Array<{ id: string; name: string; capabilities: string[] }> {
  if (catalogCache) return catalogCache
  catalogCache = listAgents().map(a => ({
    id: a.id,
    name: a.name,
    capabilities: a.capabilities || [a.personality.slice(0, 100)],
  }))
  return catalogCache
}

export function invalidateAgentCache(): void {
  catalogCache = null
  scanAndCacheAgents()
}

export function isDelegationRequest(text: string): { agentId: string; prompt: string } | null {
  const atMatch = text.match(/^@([\w][\w/-]*):?\s(.+)/)
  if (atMatch) return { agentId: atMatch[1], prompt: atMatch[2] }

  const cmdMatch = text.match(/^\/delegate\s+([\w][\w/-]*)\s+(.+)/)
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

export function registerMainAgent(): void {
  scanAndCacheAgents()
  if (!agents.has('main')) {
    registerAgent({
      id: 'main',
      name: 'Main Assistant',
      model: 'deepseek-ai/deepseek-v4-flash',
      personality: 'You are OpenCode OS Coordinator, the primary interface between the user and a team of specialist agents. Your job: handle general conversation, and when a task requires specialized skills, use @agent syntax in your response to suggest delegation. Available agents: dev (code), research (web research), sysops (system admin), writer (documentation). Respond concisely and helpfully.',
      cwd: '.',
      mcpServers: ['Bash', 'Read', 'Write', 'Grep', 'Glob', 'Web'],
      capabilities: ['general chat', 'coordination', 'task routing'],
    })
  }
}
