import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let ProjectRegistry

describe('ProjectRegistry', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencode-projects-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('registers a new project', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('test-project', '/tmp/test')

    expect(p).toHaveProperty('id')
    expect(p.name).toBe('test-project')
    expect(p.path).toBe('/tmp/test')
  })

  it('throws on duplicate name', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('unique', '/tmp/a')
    expect(() => reg.register('unique', '/tmp/b'))
      .toThrow(/already exists/i)
  })

  it('throws on missing name or path', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    expect(() => reg.register('', '/tmp/a'))
      .toThrow(/Project name is required/i)
    expect(() => reg.register('p', ''))
      .toThrow(/Project path is required/i)
  })

  it('finds project by name', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('my-project', '/tmp/foo')
    const found = reg.findByName('my-project')
    expect(found).not.toBeNull()
    expect(found.name).toBe('my-project')
  })

  it('finds project by alias', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('alpha', '/tmp/alpha', { aliases: ['a', 'first'] })
    expect(reg.findByName('a').name).toBe('alpha')
    expect(reg.findByName('first').name).toBe('alpha')
  })

  it('returns null for unknown project', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    expect(reg.findByName('nonexistent')).toBeNull()
  })

  it('lists all projects', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('p1', '/tmp/1')
    reg.register('p2', '/tmp/2')
    expect(reg.list()).toHaveLength(2)
  })

  it('filters occupied projects', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('free-one', '/tmp/free')
    const occ = reg.register('occupied-one', '/tmp/occ')
    reg.occupy(occ.id, 'agent-x', 'session-1')

    const occupied = reg.list({ status: 'occupied' })
    expect(occupied).toHaveLength(1)
    expect(occupied[0].name).toBe('occupied-one')

    const free = reg.list({ status: 'free' })
    expect(free).toHaveLength(1)
    expect(free[0].name).toBe('free-one')
  })

  it('filters by search term', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('alpha', '/tmp/x', { description: 'first project' })
    reg.register('beta', '/tmp/y', { description: 'second project' })

    const found = reg.list({ search: 'alpha' })
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('alpha')
  })

  it('occupy locks a project', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('lockable', '/tmp/lock')
    reg.occupy(p.id, 'agent-a', 'session-a')
    expect(() => reg.occupy(p.id, 'agent-b', 'session-b'))
      .toThrow(/already occupied/i)
  })

  it('occupy saves occupant details', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('occupied', '/tmp/occ')
    reg.occupy(p.id, 'agent-1', 'session-1')

    const occupant = reg.getOccupant(p.id)
    expect(occupant.agentId).toBe('agent-1')
    expect(occupant.sessionId).toBe('session-1')
    expect(occupant).toHaveProperty('occupiedAt')
  })

  it('release frees a project', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('freeable', '/tmp/free')
    reg.occupy(p.id, 'agent-a', 'session-a')
    reg.release(p.id)

    expect(reg.isOccupied(p.id)).toBe(false)
  })

  it('release returns occupant info', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('to-release', '/tmp/r')
    reg.occupy(p.id, 'agent-r', 'session-r')
    const released = reg.release(p.id)

    expect(released.agentId).toBe('agent-r')
    expect(released.sessionId).toBe('session-r')
    expect(released).toHaveProperty('occupiedAt')
  })

  it('release on free project returns null', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('never-occupied', '/tmp/none')
    expect(reg.release(p.id)).toBeNull()
  })

  it('unregister fails on occupied project', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    const p = reg.register('busy', '/tmp/busy')
    reg.occupy(p.id, 'agent-z', 'session-z')
    expect(() => reg.unregister(p.id))
      .toThrow(/occupied/i)
  })

  it('persists to disk and reloads', async () => {
    const { default: Registry } = await import('./projects.js')
    const reg = new Registry({ storeDir: dir })

    reg.register('persistent', '/tmp/persist', { description: 'survives restart' })

    const reg2 = new Registry({ storeDir: dir })
    const all = reg2.list()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('persistent')
    expect(all[0].description).toBe('survives restart')
  })
})
