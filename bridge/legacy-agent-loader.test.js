import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('LegacyAgentLoader', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'legacy-loader-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeMockRegistry(existing = []) {
    const agents = [...existing]
    return {
      list: () => agents,
      register: vi.fn((agent) => {
        agents.push(agent)
      }),
    }
  }

  function writeAgentYaml(dir, subPath, content) {
    const full = join(dir, subPath)
    const parent = full.substring(0, full.lastIndexOf('\\'))
    mkdirSync(parent, { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }

  it('loadAll returns counts when agentsDir exists with valid YAML', async () => {
    writeAgentYaml(tmpDir, 'dev/agent.yaml', [
      'name: Developer',
      'role: coder',
      'personality: focused',
      'power_packs:',
      '  - python',
      '  - js',
    ].join('\n'))
    writeAgentYaml(tmpDir, 'research/agent.yaml', [
      'name: Researcher',
      'role: analyst',
      'personality: curious',
      'power_packs:',
      '  - search',
    ].join('\n'))

    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    const mockRegistry = makeMockRegistry()
    const loader = new LegacyAgentLoader({ agentsDir: tmpDir, registry: mockRegistry })
    const result = loader.loadAll()

    expect(result.loaded).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockRegistry.register).toHaveBeenCalledTimes(2)
  })

  it('loadAll returns 0 when agentsDir is empty', async () => {
    mkdirSync(join(tmpDir, 'empty'), { recursive: true })
    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    const mockRegistry = makeMockRegistry()
    const loader = new LegacyAgentLoader({ agentsDir: join(tmpDir, 'empty'), registry: mockRegistry })
    const result = loader.loadAll()

    expect(result.loaded).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('loadAll returns 0 when agentsDir does not exist', async () => {
    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    const mockRegistry = makeMockRegistry()
    const loader = new LegacyAgentLoader({ agentsDir: join(tmpDir, 'nonexistent'), registry: mockRegistry })
    const result = loader.loadAll()

    expect(result.loaded).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('loadAll skips already-registered agents', async () => {
    writeAgentYaml(tmpDir, 'dev/agent.yaml', [
      'name: Developer',
      'role: coder',
      'personality: focused',
    ].join('\n'))

    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    const mockRegistry = makeMockRegistry([{ id: 'developer', name: 'Developer' }])
    const loader = new LegacyAgentLoader({ agentsDir: tmpDir, registry: mockRegistry })
    const result = loader.loadAll()

    expect(result.loaded).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('loadAll reports parse errors', async () => {
    writeAgentYaml(tmpDir, 'bad/agent.yaml', 'invalid: yaml: : : broken')

    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    const mockRegistry = makeMockRegistry()
    const loader = new LegacyAgentLoader({ agentsDir: tmpDir, registry: mockRegistry })
    const result = loader.loadAll()

    expect(result.loaded).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].error).toBeTruthy()
  })

  it('throws if no registry provided', async () => {
    const { LegacyAgentLoader } = await import('./legacy-agent-loader.js')
    expect(() => new LegacyAgentLoader({ agentsDir: tmpDir }).loadAll())
      .toThrow('Registry is required')
  })
})
