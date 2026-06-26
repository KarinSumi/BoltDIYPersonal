import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, unlinkSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Will import after implementation exists
let Journal

describe('Event Journal (journal.jsonl)', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencode-journal-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('should write events to a JSONL file', async () => {
    const { default: JournalClass } = await import('./journal.js')
    const journal = new JournalClass({ dir })

    journal.append({ type: 'agent_created', data: { id: 'alice' } })
    journal.append({ type: 'agent_deleted', data: { id: 'bob' } })

    const lines = readFileSync(join(dir, 'journal.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(2)

    const first = JSON.parse(lines[0])
    expect(first.type).toBe('agent_created')
    expect(first.data.id).toBe('alice')
    expect(first).toHaveProperty('ts')
    expect(first).toHaveProperty('id')
  })

  it('should replay events in order after restart', async () => {
    const { default: JournalClass } = await import('./journal.js')
    const journal = new JournalClass({ dir })

    journal.append({ type: 'event_a', data: { n: 1 } })
    journal.append({ type: 'event_b', data: { n: 2 } })
    journal.append({ type: 'event_c', data: { n: 3 } })

    // Simulate restart by creating a new instance
    const journal2 = new JournalClass({ dir })
    const replayed = journal2.replay()

    expect(replayed).toHaveLength(3)
    expect(replayed[0].type).toBe('event_a')
    expect(replayed[0].data.n).toBe(1)
    expect(replayed[1].type).toBe('event_b')
    expect(replayed[2].type).toBe('event_c')
  })

  it('should auto-trim stale entries on boot (older than 7 days)', async () => {
    const { default: JournalClass } = await import('./journal.js')
    const journal = new JournalClass({ dir })

    // Write an old event (8 days ago)
    const oldTs = Date.now() - 8 * 24 * 60 * 60 * 1000
    journal.append({ type: 'old_event' }, { overrideTs: oldTs })

    // Write a fresh event (1 hour ago)
    const freshTs = Date.now() - 60 * 60 * 1000
    journal.append({ type: 'fresh_event' }, { overrideTs: freshTs })

    // Simulate restart — trim happens in constructor
    const journal2 = new JournalClass({ dir, maxAgeDays: 7 })
    const replayed = journal2.replay()

    expect(replayed).toHaveLength(1)
    expect(replayed[0].type).toBe('fresh_event')
  })

  it('should limit total lines on boot beyond maxLines', async () => {
    const { default: JournalClass } = await import('./journal.js')
    const journal = new JournalClass({ dir })

    for (let i = 0; i < 15; i++) {
      journal.append({ type: 'event', data: { i } })
    }

    const journal2 = new JournalClass({ dir, maxLines: 10 })
    const replayed = journal2.replay()

    expect(replayed).toHaveLength(10)
    expect(replayed[0].data.i).toBe(5) // keeps the last 10 (indices 5-14)
    expect(replayed[9].data.i).toBe(14)
  })
})
