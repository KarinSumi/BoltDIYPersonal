import { randomUUID } from 'crypto'

export class PermissionBroker {
  constructor(options = {}) {
    this.registry = options.registry || null
    this.broadcast = options.broadcast || (() => {})
    this.defaultTimeout = options.defaultTimeout ?? 50000

    this.grants = new Map()
    this.pendingRequests = new Map()
    this.sessionGrants = new Set()
  }

  checkPermission(agentId, tool, context = {}) {
    const agentGrants = this.grants.get(agentId)
    const grant = agentGrants?.get(tool)

    if (grant) {
      if (grant.level === 'granted' || grant.level === 'session') {
        return { allowed: true, reason: grant.reason || '' }
      }

      if (grant.level === 'single') {
        agentGrants.set(tool, { ...grant, level: 'ask' })
        return { allowed: true, reason: grant.reason || '' }
      }

      if (grant.level === 'denied') {
        return { allowed: false, reason: grant.reason || 'Tool access denied' }
      }
    }

    const requestId = randomUUID()
    const agentName = this.registry?.get?.(agentId)?.name || agentId
    const ts = Date.now()

    const pending = {
      requestId,
      agentId,
      tool,
      context,
      ts,
      timeout: setTimeout(() => {
        this._timeoutRequest(requestId)
      }, this.defaultTimeout),
    }

    this.pendingRequests.set(requestId, pending)

    this.broadcast('permission_requested', {
      requestId,
      agentId,
      agentName,
      tool,
      context,
      ts,
    })

    return { allowed: false, reason: 'Permission needed', requestId }
  }

  approveRequest(requestId, permanent = false) {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(requestId)

    if (permanent) {
      this.setGrant(pending.agentId, pending.tool, 'granted', 'Approved by user')
    } else {
      this.setGrant(pending.agentId, pending.tool, 'single', 'Approved once')
    }

    this.broadcast('permission_approved', {
      requestId,
      agentId: pending.agentId,
      tool: pending.tool,
      permanent,
      ts: Date.now(),
    })

    return true
  }

  denyRequest(requestId) {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(requestId)

    this.broadcast('permission_denied', {
      requestId,
      agentId: pending.agentId,
      tool: pending.tool,
      ts: Date.now(),
    })

    return true
  }

  setGrant(agentId, tool, level, reason = '') {
    if (!this.grants.has(agentId)) {
      this.grants.set(agentId, new Map())
    }
    const agentGrants = this.grants.get(agentId)
    agentGrants.set(tool, { tool, level, reason })

    const key = `${agentId}:${tool}`
    if (level === 'session') {
      this.sessionGrants.add(key)
    } else {
      this.sessionGrants.delete(key)
    }
  }

  getGrants(agentId) {
    const agentGrants = this.grants.get(agentId)
    if (!agentGrants) return []
    return Array.from(agentGrants.values())
  }

  clearSessionGrants() {
    for (const key of this.sessionGrants) {
      const [agentId, tool] = key.split(':')
      const agentGrants = this.grants.get(agentId)
      if (agentGrants) {
        agentGrants.delete(tool)
      }
    }
    this.sessionGrants.clear()
  }

  getPendingRequests(agentId) {
    const all = Array.from(this.pendingRequests.values())
    if (agentId) {
      return all.filter(r => r.agentId === agentId)
    }
    return all
  }

  _timeoutRequest(requestId) {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return

    this.pendingRequests.delete(requestId)

    this.broadcast('permission_timeout', {
      requestId,
      agentId: pending.agentId,
      tool: pending.tool,
      ts: Date.now(),
    })
  }
}

export default PermissionBroker
