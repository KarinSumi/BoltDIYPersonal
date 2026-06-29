import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentSociety } from './society.js'

describe('AgentSociety', () => {
  let registry, broadcast, society

  beforeEach(() => {
    registry = {
      list: vi.fn(),
      get: vi.fn(),
    }
    broadcast = vi.fn()
  })

  afterEach(() => {
    if (society) society.stop()
  })

  it('starts a meeting with 2 agents', async () => {
    registry.get.mockImplementation((id) => {
      const agents = {
        'alice': { id: 'alice', name: 'Alice', role: 'developer' },
        'bob': { id: 'bob', name: 'Bob', role: 'researcher' },
      }
      return agents[id] || null
    })

    society = new AgentSociety({ registry, broadcast, autoStart: false })
    const meeting = await society.startMeeting('Architecture review', ['alice', 'bob'])

    expect(meeting.id).toMatch(/^meeting-/)
    expect(meeting.topic).toBe('Architecture review')
    expect(meeting.agents.length).toBe(2)
    expect(meeting.status).toBe('completed')
    expect(meeting.transcript.length).toBeGreaterThanOrEqual(4)
    expect(broadcast).toHaveBeenCalledWith('meeting_started', expect.any(Object))
    expect(broadcast).toHaveBeenCalledWith('meeting_minutes', expect.any(Object))
  })

  it('throws for less than 2 agents', async () => {
    society = new AgentSociety({ registry, broadcast, autoStart: false })
    await expect(society.startMeeting('Test', ['alice'])).rejects.toThrow()
  })

  it('throws for unknown agents', async () => {
    registry.get.mockReturnValue(null)
    society = new AgentSociety({ registry, broadcast, autoStart: false })
    await expect(society.startMeeting('Test', ['unknown1', 'unknown2'])).rejects.toThrow()
  })

  it('lists active meetings', async () => {
    registry.get.mockReturnValue({ id: 'alice', name: 'Alice', role: 'dev' })
    society = new AgentSociety({ registry, broadcast, autoStart: false })
    await society.startMeeting('Test', ['alice', 'bob'], { maxRounds: 1 })
    expect(society.listMeetings().length).toBe(1)
  })

  it('idle tick only fires with 2+ idle agents', () => {
    registry.list.mockReturnValue([
      { id: 'alice', name: 'Alice', status: 'idle' },
      { id: 'bob', name: 'Bob', status: 'idle' },
    ])
    society = new AgentSociety({ registry, broadcast, autoStart: false })
    society._tick()
    expect(broadcast).toHaveBeenCalledWith('agent_idle_chat', expect.objectContaining({
      agents: expect.arrayContaining([
        expect.objectContaining({ id: 'alice' }),
        expect.objectContaining({ id: 'bob' }),
      ]),
    }))
  })

  it('uses LLM for meeting contributions when llm option provided', async () => {
    registry.get.mockImplementation((id) => {
      const agents = {
        'alice': { id: 'alice', name: 'Alice', role: 'developer' },
        'bob': { id: 'bob', name: 'Bob', role: 'researcher' },
      }
      return agents[id] || null
    })

    const llm = vi.fn().mockResolvedValue('My analysis shows we need a microservices architecture.')
    society = new AgentSociety({ registry, broadcast, llm, autoStart: false })
    const meeting = await society.startMeeting('Architecture review', ['alice', 'bob'], { maxRounds: 1 })

    expect(meeting.transcript.some(t => t.text.includes('My analysis'))).toBe(true)
    expect(llm).toHaveBeenCalled()
  })

  it('falls back gracefully when LLM fails during meeting', async () => {
    registry.get.mockImplementation((id) => {
      const agents = {
        'alice': { id: 'alice', name: 'Alice', role: 'developer' },
        'bob': { id: 'bob', name: 'Bob', role: 'researcher' },
      }
      return agents[id] || null
    })

    const llm = vi.fn().mockRejectedValue(new Error('API down'))
    society = new AgentSociety({ registry, broadcast, llm, autoStart: false })
    const meeting = await society.startMeeting('Architecture review', ['alice', 'bob'], { maxRounds: 1 })

    expect(meeting.status).toBe('completed')
    expect(meeting.transcript.some(t => t.text.includes('was unable to contribute'))).toBe(true)
  })

  it('generates proposals via LLM when available', async () => {
    registry.list.mockReturnValue([
      { id: 'alice', name: 'Alice', role: 'developer', status: 'idle' },
      { id: 'bob', name: 'Bob', role: 'researcher', status: 'idle' },
    ])

    const llm = vi.fn()
      .mockResolvedValueOnce('Alice: Hey Bob, what are you working on?\nBob: Just finishing up the AI module.')
      .mockResolvedValueOnce('{"title": "AI Integration Project", "description": "A project to integrate AI into our workflow"}')

    society = new AgentSociety({ registry, broadcast, llm, autoStart: false })

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)

    await society._tick()

    expect(broadcast).toHaveBeenCalledWith('project_proposal', expect.objectContaining({
      type: 'project_proposal',
      title: 'AI Integration Project',
    }))

    randomSpy.mockRestore()
  })
})
