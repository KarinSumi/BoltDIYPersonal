import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

vi.mock('os', () => ({
  homedir: () => '/home/user',
}))

vi.mock('./config.js', () => ({
  PROJECT_ROOT: '/test/root',
}))

vi.mock('js-yaml', () => ({
  load: vi.fn(() => ({
    id: 'test-agent',
    name: 'Test Agent',
    model: 'gpt-4',
    personality: 'Helpful',
  })),
}))

describe('agent-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadAgentConfig', () => {
    it('returns null for non-existent agent', async () => {
      mockFs.existsSync.mockReturnValue(false)
      const { loadAgentConfig } = await import('./agent-config.js')
      const result = loadAgentConfig('nonexistent')
      expect(result).toBeNull()
    })

    it('loads agent config from PROJECT_ROOT/agents', async () => {
      mockFs.existsSync.mockReturnValue(true)
      const { loadAgentConfig } = await import('./agent-config.js')
      const result = loadAgentConfig('test-agent')
      expect(result).toBeTruthy()
      expect(result!.id).toBe('test-agent')
    })

    it('returns null on parse error', async () => {
      mockFs.existsSync.mockReturnValue(true)
      const yaml = await import('js-yaml')
      vi.mocked(yaml.load).mockImplementationOnce(() => { throw new Error('parse error') })
      const { loadAgentConfig } = await import('./agent-config.js')
      const result = loadAgentConfig('test-agent')
      expect(result).toBeNull()
    })
  })

  describe('resolveAgentDir', () => {
    it('returns PROJECT_ROOT when no cwd in config', async () => {
      mockFs.existsSync.mockReturnValue(false)
      const { resolveAgentDir } = await import('./agent-config.js')
      const result = resolveAgentDir('test-agent')
      expect(result).toBe('/test/root')
    })

    it('returns joined path when cwd is set', async () => {
      mockFs.existsSync.mockReturnValue(true)
      const yaml = await import('js-yaml')
      vi.mocked(yaml.load).mockReturnValueOnce({ id: 'test', name: 'Test', model: 'gpt-4', personality: 'Helpful', cwd: 'subdir' })
      const { resolveAgentDir } = await import('./agent-config.js')
      const result = resolveAgentDir('test-agent')
      expect(result).toBe('/test/root/subdir')
    })
  })

  describe('resolveAgentClaudeMd', () => {
    it('returns empty string when no CLAUDE.md exists', async () => {
      mockFs.existsSync.mockReturnValue(false)
      const { resolveAgentClaudeMd } = await import('./agent-config.js')
      const result = resolveAgentClaudeMd('test-agent')
      expect(result).toBe('')
    })

    it('reads CLAUDE.md from agent directory', async () => {
      mockFs.existsSync.mockImplementation((path: string) => path.includes('CLAUDE.md'))
      mockFs.readFileSync.mockReturnValue('agent instructions')
      const { resolveAgentClaudeMd } = await import('./agent-config.js')
      const result = resolveAgentClaudeMd('test-agent')
      expect(result).toBe('agent instructions')
    })
  })
})
