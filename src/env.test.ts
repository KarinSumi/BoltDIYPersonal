import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/test/root/src/env.ts'),
}))

vi.mock('path', () => ({
  dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
  resolve: (...parts: string[]) => parts.join('/'),
}))

describe('env', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty object when .env file does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const { readEnvFile } = await import('./env.js')
    expect(readEnvFile()).toEqual({})
  })

  it('parses .env file and returns key-value pairs', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('KEY1=value1\nKEY2=value2\n# comment\nKEY3=value3')
    const { readEnvFile } = await import('./env.js')
    const result = readEnvFile()
    expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2', KEY3: 'value3' })
  })

  it('strips quotes from values', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('KEY1="value1"\nKEY2=\'value2\'')
    const { readEnvFile } = await import('./env.js')
    const result = readEnvFile()
    expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' })
  })

  it('skips empty lines and comments', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('\n\n# comment\nKEY1=value1\n\n')
    const { readEnvFile } = await import('./env.js')
    const result = readEnvFile()
    expect(result).toEqual({ KEY1: 'value1' })
  })

  it('filters by keys when specified', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('KEY1=value1\nKEY2=value2\nKEY3=value3')
    const { readEnvFile } = await import('./env.js')
    const result = readEnvFile(['KEY1', 'KEY3'])
    expect(result).toEqual({ KEY1: 'value1', KEY3: 'value3' })
  })

  it('handles lines without equals sign', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('KEY1=value1\nNOEQUALS\nKEY2=value2')
    const { readEnvFile } = await import('./env.js')
    const result = readEnvFile()
    expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' })
  })

  it('exports PROJECT_ROOT', async () => {
    const { PROJECT_ROOT } = await import('./env.js')
    expect(PROJECT_ROOT).toBeTruthy()
  })
})
