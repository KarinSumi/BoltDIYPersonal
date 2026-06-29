import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./config.js', () => ({
  PROJECT_ROOT: '/test/root',
}))

vi.mock('js-yaml', () => ({
  load: vi.fn(),
}))

const mockFs = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

const mockRl = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
}))

vi.mock('readline/promises', () => ({
  createInterface: vi.fn(() => mockRl),
}))

describe('agent-create', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('creates agent with proper config structure', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ ok: true }) })) as any

    mockRl.question.mockResolvedValueOnce('test-agent')
    mockRl.question.mockResolvedValueOnce('Test Agent')
    mockRl.question.mockResolvedValueOnce('test-token')
    mockRl.question.mockResolvedValueOnce('A helpful agent')
    mockRl.question.mockResolvedValueOnce('')
    mockRl.question.mockResolvedValueOnce('')

    const { createAgentWizard } = await import('./agent-create.js')
    await createAgentWizard()

    expect(mockFs.writeFileSync).toHaveBeenCalled()
    expect(mockFs.appendFileSync).toHaveBeenCalled()
    expect(mockRl.close).toHaveBeenCalled()
  })

  it('handles invalid agent ID', async () => {
    mockRl.question.mockResolvedValueOnce('INVALID-ID')

    const { createAgentWizard } = await import('./agent-create.js')
    await createAgentWizard()

    expect(mockRl.close).toHaveBeenCalled()
    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
  })
})
