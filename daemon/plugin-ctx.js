export class PluginContext {
  constructor(options = {}) {
    this._registry = options.registry || null
    this._broadcast = options.broadcast || (() => {})
    this._llm = options.llm || null
    this._storageDir = options.storageDir || null
    this._feedCallbacks = new Map()
    this._storage = new Map()

    if (this._storageDir) {
      this._loadStorage()
    }
  }

  get registry() {
    return this._registry
      ? {
          list: () => this._registry.list(),
          get: (id) => this._registry.get(id),
        }
      : { list: () => [], get: () => null }
  }

  broadcast(type, data = {}) {
    this._broadcast({
      type,
      data,
      ts: Date.now(),
      source: 'plugin',
    })
  }

  feed(eventType, callback) {
    if (!this._feedCallbacks.has(eventType)) {
      this._feedCallbacks.set(eventType, new Set())
    }
    this._feedCallbacks.get(eventType).add(callback)

    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      const set = this._feedCallbacks.get(eventType)
      if (set) {
        set.delete(callback)
        if (set.size === 0) this._feedCallbacks.delete(eventType)
      }
    }
  }

  dispatchEvent(event) {
    const type = event?.type || ''
    const callbacks = this._feedCallbacks.get(type)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(event.data || {}, event)
        } catch {}
      }
    }

    const wildcard = this._feedCallbacks.get('*')
    if (wildcard) {
      for (const cb of wildcard) {
        try {
          cb(event.data || {}, event)
        } catch {}
      }
    }
  }

  async runClaude(prompt, options = {}) {
    if (!this._llm) {
      throw new Error('No LLM function configured')
    }
    return this._llm(prompt, options)
  }

  get storage() {
    return {
      get: (key) => this._storage.get(key),
      set: (key, value) => {
        this._storage.set(key, value)
        this._saveStorage()
      },
      delete: (key) => {
        this._storage.delete(key)
        this._saveStorage()
      },
      clear: () => {
        this._storage.clear()
        this._saveStorage()
      },
      keys: () => Array.from(this._storage.keys()),
    }
  }

  _loadStorage() {
    try {
      const { readFileSync, existsSync } = require('fs')
      const { join } = require('path')
      const path = join(this._storageDir, 'plugin-storage.json')
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf-8'))
        this._storage = new Map(Object.entries(data))
      }
    } catch {}
  }

  _saveStorage() {
    if (!this._storageDir) return
    try {
      const { writeFileSync, existsSync, mkdirSync } = require('fs')
      const { join } = require('path')
      if (!existsSync(this._storageDir)) {
        mkdirSync(this._storageDir, { recursive: true })
      }
      const path = join(this._storageDir, 'plugin-storage.json')
      const data = Object.fromEntries(this._storage)
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    } catch {}
  }
}
