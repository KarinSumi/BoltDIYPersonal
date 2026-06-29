import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import yaml from 'js-yaml'

export class LegacyAgentLoader {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd()
    this.agentsDir = options.agentsDir || join(this.baseDir, 'agents')
    this.registry = options.registry
  }

  /**
   * Load all legacy agents from YAML files into the registry
   * @returns {{ loaded: number, skipped: number, errors: Array<{file: string, error: string}> }}
   */
  loadAll() {
    if (!this.registry) throw new Error('Registry is required')
    if (!existsSync(this.agentsDir)) return { loaded: 0, skipped: 0, errors: [] }

    const result = { loaded: 0, skipped: 0, errors: [] }
    const files = this._findYamlFiles(this.agentsDir)

    for (const file of files) {
      try {
        const parsed = this._parseFile(file)
        if (!parsed) continue

        const success = this._registerAgent(parsed)
        if (success) result.loaded++
        else result.skipped++
      } catch (err) {
        result.errors.push({ file, error: err.message })
      }
    }

    return result
  }

  _findYamlFiles(dir) {
    const files = []
    if (!existsSync(dir)) return files

    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        const agentYaml = join(fullPath, 'agent.yaml')
        if (existsSync(agentYaml)) {
          files.push(agentYaml)
        }
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (ext === '.yaml' || ext === '.yml') {
          files.push(fullPath)
        }
      }
    }

    return files
  }

  _parseFile(filePath) {
    const content = readFileSync(filePath, 'utf-8')
    const data = yaml.load(content)
    if (!data || !data.name) return null

    return {
      id: data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: data.name,
      role: data.role || 'specialist',
      persona: data.personality || data.persona || '',
      skills: Array.isArray(data.power_packs) ? data.power_packs : (Array.isArray(data.skills) ? data.skills : []),
      model: data.model || undefined,
      avatar: data.avatar || undefined,
      grants: data.grants || [],
      status: 'idle',
      source: filePath,
    }
  }

  _registerAgent(agentData) {
    const existing = this.registry.list().find(a => a.name === agentData.name)
    if (existing) return false

    this.registry.register({
      id: agentData.id,
      name: agentData.name,
      role: agentData.role,
      persona: agentData.persona,
      skills: agentData.skills,
      model: agentData.model,
      avatar: agentData.avatar,
      grants: agentData.grants,
      status: 'idle',
      source: agentData.source,
    })
    return true
  }
}

export default LegacyAgentLoader
