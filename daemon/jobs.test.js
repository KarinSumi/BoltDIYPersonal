import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'
import { JobScheduler } from './jobs.js'

describe('JobScheduler', () => {
  let storeDir, scheduler

  beforeEach(() => {
    const id = crypto.randomUUID()
    storeDir = mkdtempSync(join(tmpdir(), `jobs-test-${id}`))
    scheduler = new JobScheduler({
      storeDir,
      createTask: async () => ({ id: crypto.randomUUID(), status: 'created' }),
    })
  })

  afterEach(() => {
    scheduler.stop()
    rmSync(storeDir, { recursive: true, force: true })
  })

  it('registers a new job with interval schedule', () => {
    const job = scheduler.register('Test Job', 'Do the thing', {
      type: 'interval',
      intervalMs: 60000,
    })
    expect(job).toBeDefined()
    expect(job.id).toBeDefined()
    expect(job.status).toBe('active')
    expect(job.title).toBe('Test Job')
    expect(job.prompt).toBe('Do the thing')
    expect(job.schedule.type).toBe('interval')
  })

  it('throws on missing title or prompt', () => {
    expect(() => scheduler.register('', 'prompt', { type: 'once' })).toThrow('Job title is required')
    expect(() => scheduler.register('Title', '', { type: 'once' })).toThrow('Job prompt is required')
  })

  it('throws on invalid schedule type', () => {
    expect(() => scheduler.register('Test', 'prompt', { type: 'invalid' })).toThrow('Invalid schedule type "invalid"')
  })

  it('throws on interval < 60000', () => {
    expect(() => scheduler.register('Test', 'prompt', { type: 'interval', intervalMs: 1000 })).toThrow('Interval jobs require intervalMs >= 60000')
  })

  it('lists all jobs', () => {
    const a = scheduler.register('Job A', 'do a', { type: 'once' })
    const b = scheduler.register('Job B', 'do b', { type: 'once' })
    const list = scheduler.list()
    expect(list).toHaveLength(2)
    expect(list.map(j => j.id)).toContain(a.id)
    expect(list.map(j => j.id)).toContain(b.id)
  })

  it('filters jobs by status', () => {
    const job = scheduler.register('Job', 'do it', { type: 'once' })
    scheduler.pause(job.id)
    const paused = scheduler.list({ status: 'paused' })
    expect(paused).toHaveLength(1)
    expect(paused[0].id).toBe(job.id)
    const active = scheduler.list({ status: 'active' })
    expect(active).toHaveLength(0)
  })

  it('pauses and resumes a job', () => {
    const job = scheduler.register('Job', 'do it', { type: 'once' })
    const paused = scheduler.pause(job.id)
    expect(paused.status).toBe('paused')
    const resumed = scheduler.resume(job.id)
    expect(resumed.status).toBe('active')
  })

  it('unregister removes job', () => {
    const job = scheduler.register('Job', 'do it', { type: 'once' })
    scheduler.unregister(job.id)
    expect(scheduler.get(job.id)).toBeNull()
  })

  it('unregister throws for unknown', () => {
    expect(() => scheduler.unregister('nonexistent')).toThrow('Job not found: nonexistent')
  })

  it('gets job by id', () => {
    const job = scheduler.register('Job', 'do it', { type: 'once' })
    const found = scheduler.get(job.id)
    expect(found).not.toBeNull()
    expect(found.id).toBe(job.id)
  })

  it('gets null for unknown', () => {
    expect(scheduler.get('nonexistent')).toBeNull()
  })

  it('runNow executes a job immediately', async () => {
    const job = scheduler.register('Job', 'do it', { type: 'once' })
    expect(job.lastRun).toBeNull()
    expect(job.runCount).toBe(0)
    await scheduler.runNow(job.id)
    const updated = scheduler.get(job.id)
    expect(updated.lastRun).not.toBeNull()
    expect(updated.runCount).toBe(1)
  })

  it('runNow throws for unknown job', async () => {
    await expect(scheduler.runNow('nonexistent')).rejects.toThrow('Job not found: nonexistent')
  })

  it('start and stop manage lifecycle', () => {
    expect(scheduler.running).toBe(false)
    scheduler.start()
    expect(scheduler.running).toBe(true)
    scheduler.stop()
    expect(scheduler.running).toBe(false)
  })
})
