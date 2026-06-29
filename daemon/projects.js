import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve, isAbsolute } from 'path'
import { randomUUID } from 'crypto'

const PROJECTS_FILE = 'projects.json'
const STORE_DIR = process.env.STORE_DIR || join(process.cwd(), 'store')

export class ProjectRegistry {
  constructor(options = {}) {
    this.storeDir = options.storeDir || STORE_DIR
    this.filePath = join(this.storeDir, PROJECTS_FILE)
    this.projects = new Map()
    this.occupants = new Map() // projectId -> { agentId, sessionId, occupiedAt }
    this.broadcast = options.broadcast || (() => {})

    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true })
    }

    this._load()
  }

  _load() {
    if (!existsSync(this.filePath)) return
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      if (Array.isArray(data)) {
        for (const p of data) {
          this.projects.set(p.id, p)
        }
      }
    } catch {}
  }

  _save() {
    const data = Array.from(this.projects.values())
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  _resolvePath(inputPath) {
    // Support PLACE aliases: ~ for home, . for cwd
    let resolved = inputPath
    if (resolved.startsWith('~')) {
      resolved = join(process.env.HOME || process.env.USERPROFILE || '', resolved.slice(1))
    } else if (!isAbsolute(resolved)) {
      resolved = resolve(process.cwd(), resolved)
    }
    return resolved
  }

  register(name, inputPath, options = {}) {
    // Validate
    if (!name || typeof name !== 'string') throw new Error('Project name is required')
    if (!inputPath || typeof inputPath !== 'string') throw new Error('Project path is required')

    const resolvedPath = this._resolvePath(inputPath)

    // Check for duplicate name
    for (const [, p] of this.projects) {
      if (p.name.toLowerCase() === name.toLowerCase()) {
        throw new Error(`Project "${name}" already exists`)
      }
    }

    const project = {
      id: randomUUID(),
      name,
      path: resolvedPath,
      description: options.description || '',
      aliases: options.aliases || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      occupiedBy: null, // { agentId, sessionId, occupiedAt }
      metadata: options.metadata || {},
    }

    this.projects.set(project.id, project)
    this._save()

    this.broadcast('project_registered', {
      id: project.id,
      name: project.name,
      path: project.path,
      ts: Date.now(),
    })

    return project
  }

  unregister(projectId) {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    // Check if occupied
    if (project.occupiedBy) {
      throw new Error(`Cannot unregister occupied project "${project.name}". Stop the agent first.`)
    }

    this.projects.delete(projectId)
    this.occupants.delete(projectId)
    this._save()

    this.broadcast('project_unregistered', {
      id: projectId,
      name: project.name,
      ts: Date.now(),
    })

    return true
  }

  get(projectId) {
    return this.projects.get(projectId) || null
  }

  findByName(name) {
    for (const [, p] of this.projects) {
      if (p.name.toLowerCase() === name.toLowerCase()) return p
      if (p.aliases.some(a => a.toLowerCase() === name.toLowerCase())) return p
    }
    return null
  }

  list(filter = {}) {
    let all = Array.from(this.projects.values())
    
    if (filter.status === 'occupied') {
      all = all.filter(p => p.occupiedBy !== null)
    } else if (filter.status === 'free') {
      all = all.filter(p => p.occupiedBy === null)
    }

    if (filter.search) {
      const q = filter.search.toLowerCase()
      all = all.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      )
    }

    return all
  }

  occupy(projectId, agentId, sessionId) {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (project.occupiedBy) {
      throw new Error(`Project "${project.name}" is already occupied by ${project.occupiedBy.agentId}`)
    }

    const occupant = { agentId, sessionId, occupiedAt: Date.now() }
    project.occupiedBy = occupant
    project.updatedAt = Date.now()
    this.occupants.set(projectId, occupant)
    this._save()

    this.broadcast('project_occupied', {
      id: projectId,
      name: project.name,
      agentId,
      sessionId,
      ts: Date.now(),
    })

    return occupant
  }

  release(projectId) {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!project.occupiedBy) return null

    const occupant = { ...project.occupiedBy }
    project.occupiedBy = null
    project.updatedAt = Date.now()
    this.occupants.delete(projectId)
    this._save()

    this.broadcast('project_released', {
      id: projectId,
      name: project.name,
      agentId: occupant.agentId,
      ts: Date.now(),
    })

    return occupant
  }

  isOccupied(projectId) {
    const project = this.projects.get(projectId)
    return project ? project.occupiedBy !== null : false
  }

  getOccupant(projectId) {
    const project = this.projects.get(projectId)
    return project?.occupiedBy || null
  }
}

export default ProjectRegistry
