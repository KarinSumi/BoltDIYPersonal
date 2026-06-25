type Row = Record<string, unknown>
type Table = Row[]

function extractParenthesized(sql: string, startFrom: number): [string, number] | null {
  let depth = 0
  let start = -1
  let inQuote = false
  for (let i = startFrom; i < sql.length; i++) {
    if (sql[i] === "'") { inQuote = !inQuote; continue }
    if (inQuote) continue
    if (sql[i] === '(') {
      if (depth === 0) start = i
      depth++
    } else if (sql[i] === ')') {
      depth--
      if (depth === 0 && start >= 0) {
        return [sql.slice(start + 1, i), i]
      }
    }
  }
  return null
}

class MockStatement {
  constructor(
    private sql: string,
    private tables: Map<string, Table>,
  ) {}

  private tableName(): string | null {
    const m = this.sql.match(/(?:FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+(\w+)/i)
    return m?.[1] ?? null
  }

  private whereCol(): string | null {
    const m = this.sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
    return m?.[1] ?? null
  }

  get(...args: unknown[]): Row | undefined {
    const tName = this.tableName()
    if (!tName) return undefined
    const table = this.tables.get(tName)
    if (!table || table.length === 0) return undefined
    const wCol = this.whereCol()
    if (wCol) return table.find(r => r[wCol] === args[0])
    return table[table.length - 1]
  }

  all(...args: unknown[]): Row[] {
    if (/^PRAGMA/i.test(this.sql)) return []
    const tName = this.tableName()
    if (!tName) return []
    const table = this.tables.get(tName)
    if (!table || table.length === 0) return []

    let result = [...table]
    const wCol = this.whereCol()
    if (wCol && args.length > 0) result = result.filter(r => r[wCol] === args[0])
    const limM = this.sql.match(/LIMIT\s+(\d+)/i)
    if (limM) result = result.slice(0, parseInt(limM[1]))
    return result
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    if (/^INSERT/i.test(this.sql)) {
      const tName = this.tableName()
      if (!tName) return { changes: 0, lastInsertRowid: 0 }
      if (!this.tables.has(tName)) this.tables.set(tName, [])
      const table = this.tables.get(tName)!

      const insertAt = this.sql.indexOf('(')
      if (insertAt < 0) return { changes: 0, lastInsertRowid: 0 }

      const colsParsed = extractParenthesized(this.sql, insertAt)
      if (!colsParsed) return { changes: 0, lastInsertRowid: 0 }
      const [colsStr] = colsParsed
      const cols = colsStr.split(',').map(c => c.trim())

      const valuesAt = this.sql.toUpperCase().indexOf('VALUES')
      if (valuesAt < 0) return { changes: 0, lastInsertRowid: 0 }
      const valsParsed = extractParenthesized(this.sql, valuesAt + 6)
      if (!valsParsed) return { changes: 0, lastInsertRowid: 0 }
      const [valsStr] = valsParsed

      const vals: string[] = []
      let current = ''
      let inQuote = false
      let depth = 0
      for (const ch of valsStr) {
        if (ch === "'" && !inQuote) { inQuote = true; current += ch; continue }
        if (ch === "'" && inQuote) { inQuote = false; current += ch; continue }
        if (!inQuote) {
          if (ch === '(') { depth++; current += ch; continue }
          if (ch === ')') { depth--; current += ch; continue }
          if (ch === ',' && depth === 0) { vals.push(current.trim()); current = ''; continue }
        }
        current += ch
      }
      if (current.trim()) vals.push(current.trim())

      const row: Row = {}
      let ai = 0
      for (let i = 0; i < cols.length && i < vals.length; i++) {
        const raw = vals[i]
        if (raw === '?') row[cols[i]] = args[ai++]
        else if (/^datetime/im.test(raw)) row[cols[i]] = new Date().toISOString()
        else {
          let val: string | number = raw.replace(/^'(.*)'$/, '$1')
          const num = Number(val)
          if (Number.isInteger(num) && String(num) === val) val = num
          row[cols[i]] = val
        }
      }
      if (row.status === undefined) row.status = 'pending'
      if (row.progress === undefined) row.progress = 0
      if (row.task_count === undefined) row.task_count = 0
      if (row.completed_count === undefined) row.completed_count = 0
      if (row.created_at === undefined) row.created_at = new Date().toISOString()
      table.push(row)
      return { changes: 1, lastInsertRowid: table.length }
    }

    if (/^UPDATE/i.test(this.sql)) {
      const tName = this.tableName()
      if (!tName || !this.tables.has(tName)) return { changes: 0, lastInsertRowid: 0 }
      const table = this.tables.get(tName)!
      const setM = this.sql.match(/SET\s+(.+?)(?:WHERE|$)/i)
      const wCol = this.whereCol()
      if (setM && wCol) {
        const wVal = args[args.length - 1]
        const clauses = setM[1].split(',').map(s => s.trim())
        for (const row of table) {
          if (row[wCol] !== wVal) continue
          let ai = 0
          for (const c of clauses) {
            const eq = c.match(/^(\w+)\s*=\s*(.+)$/i)
            if (!eq) continue
            const [, setCol, raw] = eq
            if (raw.trim() === '?') row[setCol] = args[ai++]
            else if (/datetime/i.test(raw)) row[setCol] = new Date().toISOString()
            else row[setCol] = raw.replace(/^'(.*)'$/, '$1')
          }
        }
      }
      return { changes: 1, lastInsertRowid: 0 }
    }

    if (/^DELETE/i.test(this.sql)) {
      const tName = this.tableName()
      if (!tName || !this.tables.has(tName)) return { changes: 0, lastInsertRowid: 0 }
      const table = this.tables.get(tName)!
      const wCol = this.whereCol()
      if (wCol) {
        const wVal = args[0]
        const before = table.length
        for (let i = table.length - 1; i >= 0; i--) {
          if (table[i][wCol] === wVal) table.splice(i, 1)
        }
        return { changes: before - table.length, lastInsertRowid: 0 }
      }
      const count = table.length
      table.length = 0
      return { changes: count, lastInsertRowid: 0 }
    }

    if (/^(PRAGMA|CREATE\s+INDEX|CREATE\s+TRIGGER)/i.test(this.sql)) {
      return { changes: 0, lastInsertRowid: 0 }
    }

    return { changes: 0, lastInsertRowid: 0 }
  }
}

class MockDatabaseSync {
  filename: string
  tables = new Map<string, Table>()

  constructor(dbPath?: string) {
    this.filename = dbPath || ':memory:'
  }

  exec(sql: string): void {
    if (/CREATE TABLE/i.test(sql)) {
      const m = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)
      if (m && !this.tables.has(m[1])) this.tables.set(m[1], [])
      return
    }
    if (/^DELETE FROM\s+(\w+)/i.test(sql)) {
      const m = sql.match(/^DELETE FROM\s+(\w+)/i)
      if (m && this.tables.has(m[1])) this.tables.set(m[1], [])
    }
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(sql, this.tables)
  }

  close(): void { this.tables.clear() }
}

export const DatabaseSync = MockDatabaseSync as unknown as typeof import('node:sqlite').DatabaseSync
