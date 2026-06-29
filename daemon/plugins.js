import { readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

export class PluginManager {
  constructor(options = {}) {
    this.dir = options.dir || join(process.cwd(), 'plugins')
    this.plugins = new Map()
    this.ctx = options.ctx || null
  }

  async loadAll() {
    if (!existsSync(this.dir)) return []
    
    const entries = readdirSync(this.dir)
    const loaded = []

    for (const entry of entries) {
      const pluginDir = join(this.dir, entry)
      if (!statSync(pluginDir).isDirectory()) continue
      
      try {
        const plugin = await this._loadPlugin(pluginDir, entry)
        if (plugin) {
          this.plugins.set(entry, plugin)
          loaded.push(plugin)
        }
      } catch (err) {
        console.error(`[Plugin] Failed to load ${entry}:`, err.message)
      }
    }

    return loaded
  }

  async _loadPlugin(dir, name) {
    const mainPath = join(dir, 'main.js')
    const indexPath = join(dir, 'index.js')
    const pkgPath = join(dir, 'package.json')

    let mainFile = mainPath
    if (!existsSync(mainFile)) {
      mainFile = existsSync(indexPath) ? indexPath : null
    }
    if (!mainFile) return null

    let metadata = { name, version: '0.0.1', description: '' }
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'))
        metadata = { ...metadata, ...pkg }
      } catch {}
    }

    const pluginUrl = pathToFileURL(mainFile).href
    const module = await import(pluginUrl)
    const plugin = {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      dir,
      panels: module.panels || [],
      routes: module.routes || [],
      commands: module.commands || [],
      onStart: module.onStart || null,
      onStop: module.onStop || null,
      module,
    }

    if (plugin.onStart && this.ctx) {
      await plugin.onStart(this.ctx)
    }

    return plugin
  }

  get(name) {
    return this.plugins.get(name) || null
  }

  list() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      panels: p.panels,
      commands: p.commands.map(c => typeof c === 'string' ? c : c.name),
    }))
  }

  mountRoutes(server) {
    for (const [name, plugin] of this.plugins) {
      if (plugin.routes.length === 0) continue
      if (!this._routes) this._routes = new Map()
      this._routes.set(name, plugin.routes)
    }
  }

  async installFromGitHub(url, options = {}) {
    const { execSync } = await import('child_process')
    const repoName = url.split('/').pop().replace('.git', '')
    const targetDir = join(this.dir, repoName)

    if (existsSync(targetDir)) {
      throw new Error(`Plugin "${repoName}" already installed`)
    }

    execSync(`git clone "${url}" "${targetDir}"`, { stdio: 'pipe' })

    const setupPath = join(targetDir, 'setup.js')
    if (existsSync(setupPath)) {
      const setupUrl = pathToFileURL(setupPath).href
      const setupModule = await import(setupUrl)
      if (setupModule.setup) {
        await setupModule.setup({ dir: targetDir })
      }
    }

    await this.loadAll()
    return repoName
  }

  async createPlugin(name, files) {
    const pluginDir = join(this.dir, name)
    if (existsSync(pluginDir)) {
      throw new Error(`Plugin "${name}" already exists`)
    }

    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(pluginDir, { recursive: true })

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(pluginDir, filePath)
      const parentDir = join(pluginDir, ...filePath.split('/').slice(0, -1))
      if (filePath.includes('/') && !existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }
      writeFileSync(fullPath, content, 'utf-8')
    }

    await this.loadAll()
    return name
  }

  stop() {
    for (const [name, plugin] of this.plugins) {
      if (plugin.onStop) {
        try { plugin.onStop() } catch {}
      }
    }
  }
}
