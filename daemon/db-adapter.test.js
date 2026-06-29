import { describe, it, expect } from 'vitest'
import { MemStore } from './db-adapter.js'

describe('MemStore', () => {
  it('pushActivity stores entries', () => {
    const store = new MemStore()
    store.pushActivity('test_event', 'test summary', 1000)
    expect(store.activities).toHaveLength(1)
    expect(store.activities[0]).toEqual({ timestamp: 1000, event: 'test_event', summary: 'test summary' })
  })

  it('getRecentActivity returns in reverse order', () => {
    const store = new MemStore()
    store.pushActivity('a', 'first', 10)
    store.pushActivity('b', 'second', 20)
    store.pushActivity('c', 'third', 30)
    const recent = store.getRecentActivity()
    expect(recent).toHaveLength(3)
    expect(recent[0].event).toBe('c')
    expect(recent[1].event).toBe('b')
    expect(recent[2].event).toBe('a')
  })

  it('maxActivity bounds the array', () => {
    const store = new MemStore()
    store.maxActivity = 3
    store.pushActivity('a', '1', 1)
    store.pushActivity('b', '2', 2)
    store.pushActivity('c', '3', 3)
    store.pushActivity('d', '4', 4)
    expect(store.activities).toHaveLength(3)
    expect(store.activities[0].event).toBe('b')
    expect(store.activities[1].event).toBe('c')
    expect(store.activities[2].event).toBe('d')
  })

  it('getMemories returns empty array', () => {
    const store = new MemStore()
    expect(store.getMemories()).toEqual([])
  })

  it('getHiveEntries returns empty array', () => {
    const store = new MemStore()
    expect(store.getHiveEntries()).toEqual([])
  })

  it('getAuditEntries returns empty array', () => {
    const store = new MemStore()
    expect(store.getAuditEntries()).toEqual([])
  })

  it('listScheduledTasks returns empty array', () => {
    const store = new MemStore()
    expect(store.listScheduledTasks()).toEqual([])
  })

  it('listMissions returns empty array', () => {
    const store = new MemStore()
    expect(store.listMissions()).toEqual([])
  })

  it('listBoards returns empty array', () => {
    const store = new MemStore()
    expect(store.listBoards()).toEqual([])
  })

  it('getBoard returns null', () => {
    const store = new MemStore()
    expect(store.getBoard('any')).toBeNull()
  })

  it('listTasks returns empty array', () => {
    const store = new MemStore()
    expect(store.listTasks('any')).toEqual([])
  })

  it('pushActivity with default timestamp', () => {
    const store = new MemStore()
    const before = Date.now()
    store.pushActivity('e', 's')
    const after = Date.now()
    expect(store.activities).toHaveLength(1)
    expect(store.activities[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(store.activities[0].timestamp).toBeLessThanOrEqual(after)
  })
})
