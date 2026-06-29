import { describe, it, expect, vi } from 'vitest'

vi.mock('./opencode-agent.js', () => ({
  queryAgent: vi.fn(),
}))
vi.mock('./orchestrator.js', () => ({
  createKanbanBoard: vi.fn(() => 'board-123'),
  createKanbanTask: vi.fn(() => 'task-123'),
}))

describe('handleCeoOrder', () => {
  it('decomposes order and creates tasks', async () => {
    const { handleCeoOrder } = await import('./ceo-chain.js')
    const { queryAgent } = await import('./opencode-agent.js')

    vi.mocked(queryAgent).mockResolvedValue({
      text: JSON.stringify([
        { title: 'Research API', agentId: 'research', prompt: 'Research the API design' },
        { title: 'Implement feature', agentId: 'dev', prompt: 'Build the feature' },
      ]),
    } as any)

    const result = await handleCeoOrder('Build a new dashboard', 'user-123')
    expect(result.plan).toContain('Research API')
    expect(result.plan).toContain('Implement feature')
    expect(result.boardId).toBe('board-123')
  })

  it('handles JSON parse failure gracefully', async () => {
    const { handleCeoOrder } = await import('./ceo-chain.js')
    const { queryAgent } = await import('./opencode-agent.js')

    vi.mocked(queryAgent).mockResolvedValue({ text: 'not valid json' } as any)

    const result = await handleCeoOrder('Do something', 'user-123')
    expect(result.plan).toBeTruthy()
    expect(result.boardId).toBe('board-123')
  })
})
