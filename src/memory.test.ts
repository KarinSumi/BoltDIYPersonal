import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string
let getMemoryContext: (...args: any[]) => any
let addGoodMemory: (...args: any[]) => any
let addBadMemory: (...args: any[]) => any

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'opencode-memory-test-'))
  process.env.STORE_DIR = tmpDir
  const mod = await import('./memory.js')
  getMemoryContext = mod.getMemoryContext
  addGoodMemory = mod.addGoodMemory
  addBadMemory = mod.addBadMemory
})

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.STORE_DIR
})

beforeEach(() => {
  const memDir = join(tmpDir, 'memory')
  rmSync(memDir, { recursive: true, force: true })
})

describe('getMemoryContext', () => {
  it('returns empty string when no memory directory exists', () => {
    const result = getMemoryContext()
    expect(result).toBe('')
  })

  it('returns formatted good section after addGoodMemory', () => {
    addGoodMemory('Successfully refactored the module')
    const result = getMemoryContext()
    expect(result).toContain('Good Behaviors')
    expect(result).toContain('Successfully refactored the module')
    expect(result).not.toContain('Bad Behaviors')
  })

  it('returns formatted bad section after addBadMemory', () => {
    addBadMemory('Forgot to handle null case')
    const result = getMemoryContext()
    expect(result).toContain('Bad Behaviors')
    expect(result).toContain('Forgot to handle null case')
    expect(result).not.toContain('Good Behaviors')
  })

  it('returns both sections when both files exist', () => {
    addGoodMemory('Good thing')
    addBadMemory('Bad thing')
    const result = getMemoryContext()
    expect(result).toContain('Good Behaviors')
    expect(result).toContain('Bad Behaviors')
    expect(result).toContain('Good thing')
    expect(result).toContain('Bad thing')
  })

  it('handles empty good.md gracefully', () => {
    const memDir = join(tmpDir, 'memory')
    rmSync(memDir, { recursive: true, force: true })
    mkdirSync(memDir, { recursive: true })
    const goodFile = join(memDir, 'good.md')
    writeFileSync(goodFile, '', 'utf-8')
    const result = getMemoryContext()
    expect(result).toBe('')
  })
})

describe('addGoodMemory', () => {
  it('creates memory directory if it does not exist', () => {
    addGoodMemory('Test entry')
    expect(existsSync(join(tmpDir, 'memory', 'good.md'))).toBe(true)
  })

  it('appends timestamped entry to good.md', () => {
    addGoodMemory('First success')
    addGoodMemory('Second success')
    const content = readFileSync(join(tmpDir, 'memory', 'good.md'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toMatch(/^\- \[.+\] First success$/)
    expect(lines[1]).toMatch(/^\- \[.+\] Second success$/)
  })
})

describe('addBadMemory', () => {
  it('creates memory directory if it does not exist', () => {
    addBadMemory('Test mistake')
    expect(existsSync(join(tmpDir, 'memory', 'bad.md'))).toBe(true)
  })

  it('appends timestamped entry to bad.md', () => {
    addBadMemory('First mistake')
    const content = readFileSync(join(tmpDir, 'memory', 'bad.md'), 'utf-8')
    expect(content).toMatch(/^\- \[.+\] First mistake\n$/)
  })
})
