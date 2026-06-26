import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

export default class Journal {
  constructor(options = {}) {
    this.dir = options.dir || process.cwd()
    this.maxAgeDays = options.maxAgeDays || 7
    this.maxLines = options.maxLines || 10000
    this.path = join(this.dir, 'journal.jsonl')

    if (existsSync(this.path)) {
      this._trim()
    }
  }

  append(event, opts = {}) {
    const entry = {
      id: crypto.randomUUID(),
      ts: opts.overrideTs || Date.now(),
      type: event.type,
      data: event.data || {},
    }
    appendFileSync(this.path, JSON.stringify(entry) + '\n', 'utf-8')
  }

  replay() {
    if (!existsSync(this.path)) return []
    const content = readFileSync(this.path, 'utf-8').trim()
    if (!content) return []
    return content.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  }

  _trim() {
    const content = readFileSync(this.path, 'utf-8').trim()
    if (!content) return

    let lines = content.split('\n').filter(Boolean)

    // Age trim: remove entries older than maxAgeDays
    if (this.maxAgeDays > 0) {
      const cutoff = Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000
      lines = lines.filter((line) => {
        try {
          const entry = JSON.parse(line)
          return entry.ts >= cutoff
        } catch {
          return false
        }
      })
    }

    // Line count trim: keep only last maxLines
    if (lines.length > this.maxLines) {
      lines = lines.slice(lines.length - this.maxLines)
    }

    writeFileSync(this.path, lines.join('\n') + '\n', 'utf-8')
  }
}
