import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectDispatch } from './project-dispatch.js'

describe('ProjectDispatch', () => {
  let registry, broadcast, dispatch

  beforeEach(() => {
    registry = {
      findByName: vi.fn(),
      isOccupied: vi.fn(),
      getOccupant: vi.fn(),
      occupy: vi.fn(),
      release: vi.fn(),
    }
    broadcast = vi.fn()
    dispatch = new ProjectDispatch({ registry, broadcast })
  })

  describe('parseDelegation', () => {
    it('parseDelegation extracts agent, project, instruction', () => {
      const result = dispatch.parseDelegation('DELEGATE: researcher @ my-project :: Research the API')
      expect(result).toEqual({
        agentId: 'researcher',
        projectName: 'my-project',
        instruction: 'Research the API',
      })
    })

    it('parseDelegation returns null for non-delegate message', () => {
      const result = dispatch.parseDelegation('Just a normal message')
      expect(result).toBeNull()
    })
  })

  describe('dispatch', () => {
    it('dispatch throws if project not found', async () => {
      registry.findByName.mockReturnValue(null)
      await expect(dispatch.dispatch('agent1', 'unknown-project', 'do stuff'))
        .rejects.toThrow('Project "unknown-project" not found.')
    })

    it('dispatch throws if project is occupied', async () => {
      registry.findByName.mockReturnValue({ id: 'proj-1', name: 'my-project', path: '/tmp/proj' })
      registry.isOccupied.mockReturnValue(true)
      registry.getOccupant.mockReturnValue({ agentId: 'other-agent', sessionId: 's-1' })

      await expect(dispatch.dispatch('agent1', 'my-project', 'do stuff'))
        .rejects.toThrow('Project "my-project" is occupied by other-agent.')
    })
  })

  describe('listSessions', () => {
    it('listSessions returns active sessions', async () => {
      registry.findByName.mockReturnValue({ id: 'proj-1', name: 'my-project', path: '/tmp/proj' })
      registry.isOccupied.mockReturnValue(false)

      await dispatch.dispatch('agent1', 'my-project', 'do stuff')
      const sessions = dispatch.listSessions()
      expect(sessions.length).toBe(1)
      expect(sessions[0].agentId).toBe('agent1')
      expect(sessions[0].projectName).toBe('my-project')
    })

    it('listSessions filters by agentId', async () => {
      registry.findByName
        .mockReturnValueOnce({ id: 'proj-a', name: 'project-a', path: '/tmp/a' })
        .mockReturnValueOnce({ id: 'proj-b', name: 'project-b', path: '/tmp/b' })
      registry.isOccupied.mockReturnValue(false)

      await dispatch.dispatch('alice', 'project-a', 'task 1')
      await dispatch.dispatch('bob', 'project-b', 'task 2')

      const aliceSessions = dispatch.listSessions({ agentId: 'alice' })
      expect(aliceSessions.length).toBe(1)
      expect(aliceSessions[0].agentId).toBe('alice')
    })
  })

  describe('endSession', () => {
    it('endSession releases project', async () => {
      registry.findByName.mockReturnValue({ id: 'proj-1', name: 'my-project', path: '/tmp/proj' })
      registry.isOccupied.mockReturnValue(false)

      const { sessionId } = await dispatch.dispatch('agent1', 'my-project', 'do stuff')
      await dispatch.endSession(sessionId)

      expect(registry.release).toHaveBeenCalledWith('proj-1')
      expect(dispatch.getSession(sessionId)).toBeNull()
    })
  })

  describe('getSession', () => {
    it('getSession returns null for unknown', () => {
      expect(dispatch.getSession('nonexistent')).toBeNull()
    })
  })
})
