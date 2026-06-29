import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, basename } from 'path'

export class SqliteMigrator {
  constructor(options = {}) {
    this.storeDir = options.storeDir || join(process.cwd(), 'store')
    this.workspaceDir = options.workspaceDir || join(process.cwd(), 'workspace')
    this.memoryDir = options.memoryDir || join(this.workspaceDir, 'memory')
    this.projectsDir = options.projectsDir || join(this.workspaceDir, 'projects')
    this.dbPath = options.dbPath || join(this.storeDir, 'data.db')
    this.broadcast = options.broadcast || (() => {})
    this.dryRun = options.dryRun || false
  }

  /**
   * Run the full migration
   * @returns {{ memories: number, projects: number, errors: string[] }}
   */
  async migrate() {
    const result = { memories: 0, projects: 0, errors: [] }

    // Ensure output directories exist
    if (!this.dryRun) {
      mkdirSync(this.memoryDir, { recursive: true })
      mkdirSync(this.projectsDir, { recursive: true })
    }

    const db = await this._openDb()
    if (!db) {
      result.errors.push('Could not open SQLite database — nothing to migrate')
      return result
    }

    try {
      // Migrate memories
      const memories = await this._readMemories(db)
      for (const mem of memories) {
        try {
          if (!this.dryRun) this._writeMemory(mem)
          result.memories++
        } catch (err) {
          result.errors.push(`Memory write error: ${err.message}`)
        }
      }

      // Migrate projects
      const projects = await this._readProjects(db)
      for (const proj of projects) {
        try {
          if (!this.dryRun) this._writeProject(proj)
          result.projects++
        } catch (err) {
          result.errors.push(`Project write error: ${err.message}`)
        }
      }

      this.broadcast('migration_complete', {
        memories: result.memories,
        projects: result.projects,
        errors: result.errors.length,
        dryRun: this.dryRun,
        ts: Date.now(),
      })
    } finally {
      await this._closeDb(db)
    }

    return result
  }

  async _openDb() {
    if (!existsSync(this.dbPath)) return null

    try {
      // Try node:sqlite (Node 22+)
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(this.dbPath)
      return { db, type: 'node-sqlite', close: () => db.close() }
    } catch {
      try {
        // Try better-sqlite3
        const Database = (await import('better-sqlite3')).default
        const db = new Database(this.dbPath, { readonly: true })
        return { db, type: 'better-sqlite3', close: () => db.close() }
      } catch {
        return null
      }
    }
  }

  async _readMemories(db) {
    const memories = []

    if (db.type === 'node-sqlite') {
      try {
        const rows = db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`).all()
        if (rows.length === 0) return memories

        const stmt = db.db.prepare('SELECT content, category, created_at FROM memories ORDER BY created_at ASC')
        const all = stmt.all()
        for (const row of all) {
          memories.push({
            content: row.content || '',
            category: row.category || 'general',
            createdAt: row.created_at || null,
          })
        }
      } catch {}
    } else if (db.type === 'better-sqlite3') {
      try {
        const rows = db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`).all()
        if (rows.length === 0) return memories

        const all = db.db.prepare('SELECT content, category, created_at FROM memories ORDER BY created_at ASC').all()
        for (const row of all) {
          memories.push({
            content: row.content || '',
            category: row.category || 'general',
            createdAt: row.created_at || null,
          })
        }
      } catch {}
    }

    return memories
  }

  _writeMemory(mem) {
    const category = mem.category || 'general'
    const timestamp = mem.createdAt || new Date().toISOString()
    const entry = `- [${timestamp}] ${mem.content}\n`

    if (category === 'good') {
      const filePath = join(this.memoryDir, 'good.md')
      let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
      writeFileSync(filePath, content + entry, 'utf-8')
    } else if (category === 'bad') {
      const filePath = join(this.memoryDir, 'bad.md')
      let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
      writeFileSync(filePath, content + entry, 'utf-8')
    } else {
      const filePath = join(this.memoryDir, `${category}.md`)
      let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
      writeFileSync(filePath, content + entry, 'utf-8')
    }
  }

  async _readProjects(db) {
    const projects = []

    if (db.type === 'node-sqlite') {
      try {
        const rows = db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).all()
        if (rows.length === 0) return projects

        const stmt = db.db.prepare('SELECT id, name, description, path, created_at FROM projects')
        const all = stmt.all()
        for (const row of all) {
          projects.push({
            id: row.id,
            name: row.name || 'unknown',
            description: row.description || '',
            path: row.path || '',
            createdAt: row.created_at || null,
          })
        }
      } catch {}
    } else if (db.type === 'better-sqlite3') {
      try {
        const rows = db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).all()
        if (rows.length === 0) return projects

        const all = db.db.prepare('SELECT id, name, description, path, created_at FROM projects').all()
        for (const row of all) {
          projects.push({
            id: row.id,
            name: row.name || 'unknown',
            description: row.description || '',
            path: row.path || '',
            createdAt: row.created_at || null,
          })
        }
      } catch {}
    }

    return projects
  }

  _writeProject(proj) {
    const filePath = join(this.projectsDir, `${proj.id || proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`)
    writeFileSync(filePath, JSON.stringify({
      id: proj.id,
      name: proj.name,
      description: proj.description,
      path: proj.path,
      createdAt: proj.createdAt || Date.now(),
      migratedFrom: 'sqlite',
    }, null, 2), 'utf-8')
  }

  async _closeDb(db) {
    try { db.close() } catch {}
  }
}

export default SqliteMigrator
