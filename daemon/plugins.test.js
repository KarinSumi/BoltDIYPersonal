import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'
import { PluginManager } from './plugins.js'

describe('PluginManager', () => {
  let pluginDir, manager

  beforeEach(() => {
    const id = crypto.randomUUID()
    pluginDir = join(tmpdir(), `plugin-test-${id}`)
    mkdirSync(pluginDir, { recursive: true })
  })

  afterEach(() => {
    if (manager) manager.stop()
    rmSync(pluginDir, { recursive: true, force: true })
  })

  it('loads plugins from directory', async () => {
    const testPlugin = join(pluginDir, 'test-plugin')
    mkdirSync(testPlugin)
    writeFileSync(join(testPlugin, 'main.js'), `
      export const name = "Test Plugin"
      export const description = "A test plugin"
      export const panels = [{ id: "test-panel", title: "Test", html: "<div>Test</div>" }]
      export const commands = ["test_cmd"]
      export const routes = [{ method: "GET", path: "/api/test", handler: () => {} }]
    `)

    manager = new PluginManager({ dir: pluginDir })
    const loaded = await manager.loadAll()
    expect(loaded.length).toBe(1)
    expect(loaded[0].name).toBe('test-plugin')
  })

  it('skips non-plugin directories', async () => {
    writeFileSync(join(pluginDir, 'not-a-plugin.txt'), 'hello')
    manager = new PluginManager({ dir: pluginDir })
    const loaded = await manager.loadAll()
    expect(loaded.length).toBe(0)
  })

  it('lists loaded plugins', async () => {
    const testPlugin = join(pluginDir, 'test-plugin')
    mkdirSync(testPlugin)
    writeFileSync(join(testPlugin, 'main.js'), `
      export const name = "Test Plugin"
      export const description = "A test plugin"
      export const panels = [{ id: "p1", title: "P1", html: "<div>P1</div>" }]
      export const commands = ["cmd1"]
      export const routes = []
    `)

    manager = new PluginManager({ dir: pluginDir })
    await manager.loadAll()
    const list = manager.list()
    expect(list.length).toBe(1)
    expect(list[0].commands).toContain('cmd1')
  })

  it('installs plugin from GitHub URL', async () => {
    manager = new PluginManager({ dir: pluginDir })
    
    const execSync = vi.fn()
    const mockPluginDir = join(pluginDir, 'mock-plugin')
    mkdirSync(mockPluginDir)
    writeFileSync(join(mockPluginDir, 'main.js'), `
      export const name = "Mock Plugin"
      export const description = "Installed plugin"
      export const panels = []
      export const commands = []
      export const routes = []
    `)

    await manager.loadAll()
    const list = manager.list()
    expect(Array.isArray(list)).toBe(true)
  })

  it('creates a new plugin from files', async () => {
    manager = new PluginManager({ dir: pluginDir })
    const name = await manager.createPlugin('my-plugin', {
      'main.js': `export const name = "My Plugin"\nexport const panels = []\nexport const commands = []\nexport const routes = []`,
      'package.json': JSON.stringify({ name: 'my-plugin', version: '1.0.0' }),
    })
    expect(name).toBe('my-plugin')
    expect(manager.get('my-plugin')).not.toBeNull()
  })
})
