import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let Registry

describe('Agent Registry', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencode-registry-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('should register an agent and list it', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'researcher', name: 'Researcher', role: 'Research specialist' })
    const all = reg.list()

    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('researcher')
    expect(all[0].name).toBe('Researcher')
  })

  it('should reject registering a duplicate id', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'alice', name: 'Alice' })
    expect(() => reg.register({ id: 'alice', name: 'Alice Again' }))
      .toThrow(/already exists/i)
  })

  it('should get an agent by id', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'bob', name: 'Bob' })
    const agent = reg.get('bob')
    expect(agent.name).toBe('Bob')
  })

  it('should return null for unknown id', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    expect(reg.get('nobody')).toBeNull()
  })

  it('should update an existing agent', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'alice', name: 'Alice', role: 'Engineer' })
    reg.update('alice', { role: 'Senior Engineer', skills: ['code-review'] })

    const agent = reg.get('alice')
    expect(agent.role).toBe('Senior Engineer')
    expect(agent.skills).toEqual(['code-review'])
    // Original fields preserved
    expect(agent.name).toBe('Alice')
  })

  it('should remove an agent', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'alice', name: 'Alice' })
    reg.remove('alice')
    expect(reg.get('alice')).toBeNull()
    expect(reg.list()).toHaveLength(0)
  })

  it('should protect "ceo" and "main" from deletion', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'ceo', name: 'CEO' })
    expect(() => reg.remove('ceo')).toThrow(/protected/i)

    reg.register({ id: 'main', name: 'Director' })
    expect(() => reg.remove('main')).toThrow(/protected/i)
  })

  it('should persist to disk and survive restart', async () => {
    const { default: RegistryClass } = await import('./registry.js')
    const reg = new RegistryClass({ dir })

    reg.register({ id: 'alice', name: 'Alice' })
    reg.register({ id: 'bob', name: 'Bob' })

    // Simulate restart
    const reg2 = new RegistryClass({ dir })
    const all = reg2.list()
    expect(all).toHaveLength(2)
    expect(all.find((a) => a.id === 'alice').name).toBe('Alice')
  })
})
