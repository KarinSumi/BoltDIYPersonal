import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sqlite-migrate-test-'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function createMinimalSqliteDb() {
  const pageSize = 4096
  const buf = Buffer.alloc(pageSize)
  buf.write('SQLite format 3\0', 0, 16)
  buf.writeUInt16BE(pageSize, 16)
  buf[18] = 1
  buf[19] = 1
  buf[20] = 0
  buf[21] = 64
  buf[22] = 32
  buf[23] = 32
  buf.writeUInt32BE(0, 24)
  buf.writeUInt32BE(1, 28)
  buf.writeUInt32BE(0, 32)
  buf.writeUInt32BE(0, 36)
  buf.writeUInt32BE(1, 40)
  buf.writeUInt32BE(4, 44)
  buf.writeUInt32BE(0, 48)
  buf.writeUInt32BE(0, 52)
  buf.writeUInt32BE(1, 56)
  buf.writeUInt32BE(0, 60)
  buf.writeUInt32BE(0, 64)
  buf.writeUInt32BE(0, 68)
  buf.writeUInt32BE(0, 92)
  buf.writeUInt32BE(0, 96)
  buf[100] = 0x0D
  buf.writeUInt16BE(0, 101)
  buf.writeUInt16BE(0, 103)
  buf.writeUInt16BE(pageSize, 105)
  buf.writeUInt32BE(0, 107)
  return buf
}

describe('SqliteMigrator', () => {
  describe('constructor', () => {
    it('sets default paths', async () => {
      const { SqliteMigrator } = await import('./sqlite-migrate.js')
      const m = new SqliteMigrator()
      expect(m.storeDir).toBe(join(process.cwd(), 'store'))
      expect(m.workspaceDir).toBe(join(process.cwd(), 'workspace'))
      expect(m.memoryDir).toBe(join(process.cwd(), 'workspace', 'memory'))
      expect(m.projectsDir).toBe(join(process.cwd(), 'workspace', 'projects'))
      expect(m.dbPath).toBe(join(process.cwd(), 'store', 'data.db'))
      expect(m.dryRun).toBe(false)
      expect(typeof m.broadcast).toBe('function')
    })
  })

  describe('migrate', () => {
    it('returns zero counts when no db exists', async () => {
      const { SqliteMigrator } = await import('./sqlite-migrate.js')
      const m = new SqliteMigrator({
        dbPath: join(tmpDir, 'nonexistent.db'),
        memoryDir: join(tmpDir, 'mem'),
        projectsDir: join(tmpDir, 'proj'),
      })
      const result = await m.migrate()
      expect(result.memories).toBe(0)
      expect(result.projects).toBe(0)
      expect(result.errors).toEqual([
        'Could not open SQLite database — nothing to migrate',
      ])
    })

    it('handles db with no tables gracefully', async () => {
      const { SqliteMigrator } = await import('./sqlite-migrate.js')
      const dbPath = join(tmpDir, 'empty.db')
      writeFileSync(dbPath, createMinimalSqliteDb())

      const memDir = join(tmpDir, 'mem2')
      const projDir = join(tmpDir, 'proj2')

      const m = new SqliteMigrator({ dbPath, memoryDir: memDir, projectsDir: projDir })
      const result = await m.migrate()
      expect(result.memories).toBe(0)
      expect(result.projects).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('does not write files when dryRun is true', async () => {
      const { SqliteMigrator } = await import('./sqlite-migrate.js')
      const dbPath = join(tmpDir, 'dryrun.db')
      const memDir = join(tmpDir, 'mem3')
      const projDir = join(tmpDir, 'proj3')

      mkdirSync(memDir, { recursive: true })
      mkdirSync(projDir, { recursive: true })

      const mockDb = {
        db: {
          prepare: (sql) => ({
            all: () => {
              if (/sqlite_master.*memories/.test(sql)) return [{ name: 'memories' }]
              if (/sqlite_master.*projects/.test(sql)) return [{ name: 'projects' }]
              if (/FROM memories/.test(sql)) return [
                { content: 'good thing', category: 'good', created_at: '2025-01-01T00:00:00.000Z' },
                { content: 'bad thing', category: 'bad', created_at: '2025-01-02T00:00:00.000Z' },
                { content: 'neutral thing', category: 'general', created_at: '2025-01-03T00:00:00.000Z' },
              ]
              if (/FROM projects/.test(sql)) return [
                { id: 'proj-1', name: 'Alpha', description: 'First project', path: '/alpha', created_at: '2025-01-01T00:00:00.000Z' },
              ]
              return []
            },
          }),
        },
        type: 'node-sqlite',
        close: () => {},
      }

      const m = new SqliteMigrator({
        dbPath,
        memoryDir: memDir,
        projectsDir: projDir,
        dryRun: true,
      })

      vi.spyOn(m, '_openDb').mockResolvedValue(mockDb)

      const result = await m.migrate()

      expect(result.memories).toBe(3)
      expect(result.projects).toBe(1)
      expect(result.errors).toHaveLength(0)

      expect(readdirSync(memDir)).toHaveLength(0)
      expect(readdirSync(projDir)).toHaveLength(0)
    })
  })
})
