import { vi } from 'vitest'

vi.mock('node:sqlite', () => {
  type Row = Record<string, unknown>
  type Table = Row[]

  class MockStatement {
    constructor(
      private sql: string,
      private tables: Map<string, Table>,
    ) {}

    private getTableName(): string | null {
      const m = this.sql.match(/(?:FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+(\w+)/i)
      return m?.[1] ?? null
    }

    private findWhereCol(): [string, unknown] | null {
      const m = this.sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
      return m ? [m[1], undefined] : null
    }

    get(...args: unknown[]): Row | undefined {
      const tName = this.getTableName()
      if (!tName) return undefined
      const table = this.tables.get(tName)
      if (!table || table.length === 0) return undefined
      const where = this.findWhereCol()
      if (where) {
        const colVal = args[0] ?? null
        return [...table].reverse().find(r => r[where[0]] === colVal)
      }
      return table[table.length - 1]
    }

    all(...args: unknown[]): Row[] {
      const tName = this.getTableName()
      if (!tName) return []
      const table = this.tables.get(tName)
      if (!table || table.length === 0) return []

      let result = [...table]

      const where = this.findWhereCol()
      if (where && args.length > 0) {
        result = result.filter(r => r[where[0]] === args[0])
      }

      const statusM = this.sql.match(/'(\w+)'/)
      if (statusM) result = result.filter(r => r.status === statusM[1])

      const limitM = this.sql.match(/LIMIT\s+(\d+)/i)
      if (limitM) result = result.slice(0, parseInt(limitM[1]))

      return result
    }

    run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
      if (/^INSERT/i.test(this.sql)) {
        const tName = this.getTableName()
        if (!tName) return { changes: 0, lastInsertRowid: 0 }
        if (!this.tables.has(tName)) this.tables.set(tName, [])
        const table = this.tables.get(tName)!

        const colsM = this.sql.match(/\(([^)]+)\)\s*VALUES/i)
        const valsM = this.sql.match(/VALUES\s*\(([^)]+)\)/i)
        if (colsM && valsM) {
          const cols = colsM[1].split(',').map(c => c.trim().replace(/^'(.*)'$/, '$1'))
          const rawVals = valsM[1].split(',').map(c => c.trim())
          const row: Row = {}
          let ai = 0
          for (let i = 0; i < cols.length; i++) {
            const rv = rawVals[i] || ''
            if (rv === '?') row[cols[i]] = args[ai++]
            else if (/datetime/i.test(rv)) row[cols[i]] = new Date().toISOString()
            else row[cols[i]] = rv.replace(/^'(.*)'$/, '$1')
          }
          table.push(row)
        }
        return { changes: 1, lastInsertRowid: table.length }
      }

      if (/^UPDATE/i.test(this.sql)) {
        const tName = this.getTableName()
        if (!tName || !this.tables.has(tName)) return { changes: 0, lastInsertRowid: 0 }
        const table = this.tables.get(tName)!
        const setM = this.sql.match(/SET\s+(.+?)(?:WHERE|$)/i)
        const whereM = this.sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
        if (setM && whereM) {
          const wCol = whereM[1]
          const wVal = args[args.length - 1]
          const clauses = setM[1].split(',').map(s => s.trim())
          for (const row of table) {
            if (row[wCol] !== wVal) continue
            for (const c of clauses) {
              const eq = c.match(/^(\w+)\s*=\s*(.+)$/i)
              if (!eq) continue
              const [, setCol, raw] = eq
              if (raw.trim() === '?') row[setCol] = args[clauses.indexOf(c)]
              else if (/datetime/i.test(raw)) row[setCol] = new Date().toISOString()
              else row[setCol] = raw.replace(/^'?(.*?)'?$/, '$1')
            }
          }
        }
        return { changes: 1, lastInsertRowid: 0 }
      }

      if (/^(ALTER|PRAGMA|CREATE\s+INDEX|CREATE\s+TRIGGER)/i.test(this.sql)) {
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
        const m = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i)
        if (m && !this.tables.has(m[1])) this.tables.set(m[1], [])
      }
    }

    prepare(sql: string) {
      return new MockStatement(sql, this.tables)
    }

    close(): void { this.tables.clear() }
  }

  return { DatabaseSync: MockDatabaseSync }
})
