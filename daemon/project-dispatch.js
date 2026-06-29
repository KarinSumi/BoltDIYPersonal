import { join } from 'path'
import { execSync, exec } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

export class ProjectDispatch {
  constructor(options = {}) {
    this.registry = options.registry
    this.broadcast = options.broadcast || (() => {})
    this.activeSessions = new Map()
  }

  parseDelegation(message) {
    const delegateRegex = /DELEGATE:\s*(\w+)\s*@\s*([\w-]+)\s*::\s*(.+)/
    const match = message.match(delegateRegex)
    if (!match) return null

    return {
      agentId: match[1],
      projectName: match[2],
      instruction: match[3].trim(),
    }
  }

  parseProjectRef(message) {
    const refRegex = /@\s*([\w-]+)/
    const match = message.match(refRegex)
    if (!match) return null
    return match[1]
  }

  async dispatch(agentId, projectName, instruction, options = {}) {
    const project = this.registry.findByName(projectName)
    if (!project) {
      throw new Error(`Project "${projectName}" not found. Register it first with "project:register"`)
    }

    if (this.registry.isOccupied(project.id)) {
      const occupant = this.registry.getOccupant(project.id)
      throw new Error(`Project "${project.name}" is occupied by ${occupant.agentId}. Wait for them to finish.`)
    }

    const sessionId = options.sessionId || `session-${randomUUID().slice(0, 8)}`

    this.registry.occupy(project.id, agentId, sessionId)

    const session = {
      sessionId,
      projectId: project.id,
      projectName: project.name,
      agentId,
      instruction,
      workDir: project.path,
      startedAt: Date.now(),
      status: 'running',
      log: [],
    }

    this.activeSessions.set(sessionId, session)

    this.broadcast('project_session_started', {
      sessionId,
      projectId: project.id,
      projectName: project.name,
      agentId,
      workDir: project.path,
      instruction,
      ts: Date.now(),
    })

    if (options.setupCommand) {
      try {
        await this._runCommand(options.setupCommand, project.path)
      } catch (err) {
        this.registry.release(project.id)
        this.activeSessions.delete(sessionId)
        throw new Error(`Setup failed: ${err.message}`)
      }
    }

    return { sessionId, projectId: project.id, workDir: project.path }
  }

  async endSession(sessionId, options = {}) {
    const session = this.activeSessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    this.registry.release(session.projectId)
    session.status = 'completed'
    session.endedAt = Date.now()

    this.activeSessions.delete(sessionId)

    this.broadcast('project_session_ended', {
      sessionId,
      projectId: session.projectId,
      projectName: session.projectName,
      agentId: session.agentId,
      duration: session.endedAt - session.startedAt,
      ts: Date.now(),
    })

    return { sessionId, status: 'completed' }
  }

  getSession(sessionId) {
    return this.activeSessions.get(sessionId) || null
  }

  listSessions(filter = {}) {
    let all = Array.from(this.activeSessions.values())
    if (filter.agentId) {
      all = all.filter(s => s.agentId === filter.agentId)
    }
    if (filter.projectId) {
      all = all.filter(s => s.projectId === filter.projectId)
    }
    return all
  }

  async _runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
      exec(command, { cwd, maxBuffer: 2 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
        } else {
          resolve(stdout)
        }
      })
    })
  }
}

export default ProjectDispatch
