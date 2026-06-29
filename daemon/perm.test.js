import { describe, it, expect, beforeEach } from 'vitest'
import PermissionBroker from './perm.js'

describe('PermissionBroker', () => {
  let broker
  let events

  beforeEach(() => {
    events = []
    const broadcast = (event, data) => {
      events.push({ event, data })
    }
    broker = new PermissionBroker({ broadcast })
  })

  it('checkPermission allows granted tool', () => {
    broker.setGrant('agent-1', 'bash', 'granted')
    const result = broker.checkPermission('agent-1', 'bash')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('')
  })

  it('checkPermission blocks unknown tool', () => {
    const result = broker.checkPermission('agent-1', 'bash')
    expect(result.allowed).toBe(false)
    expect(result.requestId).toBeDefined()
    expect(result.reason).toBe('Permission needed')
  })

  it('checkPermission handles single-use grant', () => {
    broker.setGrant('agent-1', 'bash', 'single')
    const first = broker.checkPermission('agent-1', 'bash')
    expect(first.allowed).toBe(true)

    const second = broker.checkPermission('agent-1', 'bash')
    expect(second.allowed).toBe(false)
    expect(second.requestId).toBeDefined()
  })

  it('checkPermission handles session grant', () => {
    broker.setGrant('agent-1', 'bash', 'session')
    expect(broker.checkPermission('agent-1', 'bash').allowed).toBe(true)

    broker.clearSessionGrants()
    expect(broker.checkPermission('agent-1', 'bash').allowed).toBe(false)
  })

  it('checkPermission handles denied grant', () => {
    broker.setGrant('agent-1', 'bash', 'denied', 'No shell access')
    const result = broker.checkPermission('agent-1', 'bash')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('No shell access')
  })

  it('approveRequest resolves pending request', () => {
    const check = broker.checkPermission('agent-1', 'bash')
    expect(check.allowed).toBe(false)
    expect(check.requestId).toBeDefined()

    const result = broker.approveRequest(check.requestId)
    expect(result).toBe(true)
  })

  it('approveRequest with permanent creates granted level', () => {
    const check = broker.checkPermission('agent-1', 'bash')
    broker.approveRequest(check.requestId, true)

    const result = broker.checkPermission('agent-1', 'bash')
    expect(result.allowed).toBe(true)
  })

  it('denyRequest rejects pending', () => {
    const check = broker.checkPermission('agent-1', 'bash')
    const denied = broker.denyRequest(check.requestId)
    expect(denied).toBe(true)

    const pending = broker.getPendingRequests()
    expect(pending).toHaveLength(0)
  })

  it('denyRequest returns false for invalid id', () => {
    const result = broker.denyRequest('nonexistent-id')
    expect(result).toBe(false)
  })

  it('setGrant overrides existing grant', () => {
    broker.setGrant('agent-1', 'bash', 'granted')
    expect(broker.checkPermission('agent-1', 'bash').allowed).toBe(true)

    broker.setGrant('agent-1', 'bash', 'denied', 'Blocked')
    expect(broker.checkPermission('agent-1', 'bash').allowed).toBe(false)
  })

  it('pending requests auto-timeout', async () => {
    const timeoutEvents = []
    const broadcast = (event, data) => {
      if (event === 'permission_timeout') timeoutEvents.push(data)
    }
    broker = new PermissionBroker({ broadcast, defaultTimeout: 10 })

    broker.checkPermission('agent-1', 'bash')
    await new Promise(r => setTimeout(r, 50))

    expect(timeoutEvents).toHaveLength(1)
    expect(timeoutEvents[0].tool).toBe('bash')
    expect(timeoutEvents[0].agentId).toBe('agent-1')
  })

  it('getGrants returns all grants for agent', () => {
    broker.setGrant('agent-1', 'bash', 'granted')
    broker.setGrant('agent-1', 'write_file', 'denied', 'Not allowed')

    const grants = broker.getGrants('agent-1')
    expect(grants).toHaveLength(2)
    expect(grants.find(g => g.tool === 'bash').level).toBe('granted')
    expect(grants.find(g => g.tool === 'write_file').level).toBe('denied')
    expect(grants.find(g => g.tool === 'write_file').reason).toBe('Not allowed')
  })

  it('getPendingRequests filters by agent', () => {
    broker.checkPermission('agent-1', 'bash')
    broker.checkPermission('agent-1', 'write_file')
    broker.checkPermission('agent-2', 'bash')

    const agent1Pending = broker.getPendingRequests('agent-1')
    expect(agent1Pending).toHaveLength(2)

    const agent2Pending = broker.getPendingRequests('agent-2')
    expect(agent2Pending).toHaveLength(1)

    const allPending = broker.getPendingRequests()
    expect(allPending).toHaveLength(3)
  })
})
