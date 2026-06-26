import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const PROTECTED_IDS = new Set(['ceo', 'main'])

export default class Registry {
  constructor(options = {}) {
    this.dir = options.dir || process.cwd()
    this.path = join(this.dir, 'registry.json')
    this.agents = new Map()

    if (existsSync(this.path)) {
      this._load()
    } else {
      this._save()
    }
  }

  register(agent) {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" already exists`)
    }
    this.agents.set(agent.id, { ...agent })
    this._save()
  }

  get(id) {
    return this.agents.get(id) || null
  }

  list() {
    return Array.from(this.agents.values())
  }

  update(id, patch) {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Agent "${id}" not found`)
    Object.assign(agent, patch)
    this._save()
  }

  remove(id) {
    if (PROTECTED_IDS.has(id)) {
      throw new Error(`Agent "${id}" is protected and cannot be deleted`)
    }
    if (!this.agents.has(id)) {
      throw new Error(`Agent "${id}" not found`)
    }
    this.agents.delete(id)
    this._save()
  }

  _load() {
    const content = readFileSync(this.path, 'utf-8')
    const data = JSON.parse(content)
    this.agents = new Map(data.map((a) => [a.id, a]))
  }

  _save() {
    const data = Array.from(this.agents.values())
    writeFileSync(this.path, JSON.stringify(data, null, 2), 'utf-8')
  }
}
