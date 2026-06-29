import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'
import { BM25, MemoryStore } from './retrieval.js'

describe('BM25', () => {
  let bm25

  beforeEach(() => {
    bm25 = new BM25()
  })

  it('indexes and searches documents', () => {
    bm25.indexDocuments([
      'The quick brown fox jumps over the lazy dog',
      'Machine learning is a subset of artificial intelligence',
      'JavaScript is a programming language for the web',
      'Fox hunting is a traditional activity',
    ])

    const results = bm25.search('fox')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].text.toLowerCase()).toContain('fox')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('returns empty for no matches', () => {
    bm25.indexDocuments(['hello world'])
    const results = bm25.search('xyznonexistent')
    expect(results.length).toBe(0)
  })

  it('handles empty document list', () => {
    bm25.indexDocuments([])
    const results = bm25.search('test')
    expect(results.length).toBe(0)
  })

  it('ranks more relevant documents higher', () => {
    bm25.indexDocuments([
      'Python is popular for data science',
      'JavaScript is for web development',
      'Python and data science go well together',
      'The weather is nice today',
    ])

    const results = bm25.search('python data science')
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].text).toMatch(/python/i)
  })
})

describe('MemoryStore', () => {
  let baseDir, store

  beforeEach(() => {
    const id = crypto.randomUUID()
    baseDir = join(tmpdir(), `memory-test-${id}`)
    mkdirSync(join(baseDir, 'memory'), { recursive: true })
    store = new MemoryStore({ baseDir })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('stores and retrieves memory', () => {
    store.store('agent-1', 'Alice is a senior developer who works on backend systems.')
    const memory = store.get('agent-1')
    expect(memory).not.toBeNull()
    expect(memory.text).toContain('Alice')
  })

  it('stores shared memory', () => {
    store.store('shared', 'Office hours are 9-5 M-F', { type: 'shared' })
    writeFileSync(join(baseDir, 'OFFICE.md'), 'Office hours are 9-5 M-F')
    const s = new MemoryStore({ baseDir })
    expect(s.get('shared')).not.toBeNull()
  })

  it('queries memory by relevance', () => {
    store.store('dev', 'Developer tools and coding practices')
    store.store('hr', 'Human resources and hiring policies')
    const results = store.query('developer coding')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].id).toBe('dev')
  })

  it('lists all memories', () => {
    store.store('a1', 'Memory one')
    store.store('a2', 'Memory two')
    const list = store.list()
    expect(list.length).toBeGreaterThanOrEqual(2)
  })
})
