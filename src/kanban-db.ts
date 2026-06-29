import { getDb } from './db.js'
import { v4 as uuid } from 'uuid'

// ── Types ──

export interface Board {
  id: string; title: string; description: string | null
  status: string; priority: number; owner: string
  task_count: number; completed_count: number; progress_pct: number
  summary: string | null
  created_at: string; updated_at: string
}

export interface Task {
  id: string; board_id: string; parent_task_id: string | null
  title: string; prompt: string; assignee: string | null
  status: string; priority: number
  task_type: 'nim' | 'opencode'
  depends_on: string | null; retry_count: number; max_retries: number
  progress: number; result: string | null; error: string | null
  started_at: string | null; completed_at: string | null
  created_at: string; updated_at: string
}

export interface AgentSession {
  agent_id: string; status: string; current_task_id: string | null
  consecutive_failures: number; skills: string | null
  last_heartbeat: string; created_at: string; updated_at: string
}

// ── Boards ──

export function createBoard(opts: {
  title: string; description?: string; priority?: number; owner: string
}): string {
  const id = uuid()
  const db = getDb()
  db.prepare(`INSERT INTO kanban_boards (id, title, description, status, priority, owner, task_count, completed_count, progress_pct, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, 0, 0, 0, datetime('now'), datetime('now'))`).run(
    id, opts.title, opts.description ?? null, opts.priority ?? 3, opts.owner
  )
  return id
}

export function getBoard(id: string): Board | undefined {
  const row = getDb().prepare('SELECT * FROM kanban_boards WHERE id = ?').get(id) as Board | undefined
  return row
}

export function listAllBoards(status?: string): Board[] {
  if (status) {
    const all = getDb().prepare('SELECT * FROM kanban_boards ORDER BY created_at DESC').all() as Board[]
    return all.filter(b => b.status === status)
  }
  return getDb().prepare('SELECT * FROM kanban_boards ORDER BY created_at DESC').all() as Board[]
}

export function listBoards(owner: string, status?: string): Board[] {
  if (status) {
    const all = getDb().prepare('SELECT * FROM kanban_boards WHERE owner = ? ORDER BY created_at DESC').all(owner) as Board[]
    return all.filter(b => b.status === status)
  }
  return getDb().prepare('SELECT * FROM kanban_boards WHERE owner = ? ORDER BY created_at DESC').all(owner) as Board[]
}

export function updateBoard(id: string, changes: Record<string, unknown>): void {
  const sets = Object.keys(changes).map(k => `${k} = ?`).join(', ')
  const vals = Object.values(changes)
  getDb().prepare(`UPDATE kanban_boards SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
}

export function pauseBoard(id: string): void {
  getDb().prepare("UPDATE kanban_boards SET status = 'paused', updated_at = datetime('now') WHERE id = ?").run(id)
}

export function resumeBoard(id: string): void {
  getDb().prepare("UPDATE kanban_boards SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id)
}

export function archiveBoard(id: string, summary?: string): void {
  getDb().prepare("UPDATE kanban_boards SET status = 'archived', summary = ?, updated_at = datetime('now') WHERE id = ?").run(summary ?? null, id)
}

// ── Tasks ──

export function createTask(opts: {
  board_id: string; title: string; prompt: string
  assignee?: string; priority?: number; status?: string
  depends_on?: string; parent_task_id?: string; max_retries?: number
  task_type?: 'nim' | 'opencode'
}): string {
  const id = uuid()
  const db = getDb()
  db.prepare(`INSERT INTO kanban_tasks (id, board_id, parent_task_id, title, prompt, assignee, status, priority, task_type, depends_on, retry_count, max_retries, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, datetime('now'), datetime('now'))`).run(
    id, opts.board_id, opts.parent_task_id ?? null,
    opts.title, opts.prompt, opts.assignee ?? null,
    opts.status ?? 'triage', opts.priority ?? 3,
    opts.task_type ?? 'nim',
    opts.depends_on ?? null, opts.max_retries ?? 2
  )
  return id
}

export function getTask(id: string): Task | undefined {
  return getDb().prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(id) as Task | undefined
}

export function listTasks(boardId: string): Task[] {
  return getDb().prepare('SELECT * FROM kanban_tasks WHERE board_id = ? ORDER BY created_at ASC').all(boardId) as Task[]
}

export function updateTask(id: string, changes: Record<string, unknown>): void {
  const sets = Object.keys(changes).map(k => `${k} = ?`).join(', ')
  const vals = Object.values(changes)
  getDb().prepare(`UPDATE kanban_tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
}

export function completeTask(taskId: string, result: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'completed', result = ?, progress = 100, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(result, taskId)
}

export function failTask(taskId: string, error: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?").run(error, taskId)
}

export function blockTask(taskId: string, reason: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'blocked', error = ?, updated_at = datetime('now') WHERE id = ?").run(reason, taskId)
}

export function unblockTask(taskId: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'ready', error = NULL, updated_at = datetime('now') WHERE id = ?").run(taskId)
}

export function cancelTask(taskId: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(taskId)
}

export function claimTask(taskId: string, assignee: string): void {
  getDb().prepare("UPDATE kanban_tasks SET status = 'running', assignee = ?, started_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status IN ('ready', 'triage')").run(assignee, taskId)
}

// ── Dispatcher queries ──

export function getTasksByStatus(status: string): Task[] {
  return getDb().prepare('SELECT * FROM kanban_tasks WHERE status = ? ORDER BY priority ASC, created_at ASC').all(status) as Task[]
}

export function getDependentTasks(taskId: string): Task[] {
  const db = getDb()
  const all = db.prepare("SELECT * FROM kanban_tasks WHERE depends_on IS NOT NULL AND status != 'completed'").all() as Task[]
  return all.filter(t => {
    try {
      const deps = JSON.parse(t.depends_on!)
      return Array.isArray(deps) && deps.includes(taskId)
    } catch {
      return false
    }
  })
}

export function advanceDependencies(completedTaskId: string): void {
  const dependents = getDependentTasks(completedTaskId)
  for (const t of dependents) {
    try {
      const deps = JSON.parse(t.depends_on!) as string[]
      const allDone = deps.every(depId => {
        const depTask = getTask(depId)
        return depTask && depTask.status === 'completed'
      })
      if (allDone && t.status === 'blocked') {
        unblockTask(t.id)
      }
    } catch { /* skip malformed depends_on */ }
  }
}

export function releaseStaleClaims(staleTimeoutMs: number): Task[] {
  const db = getDb()
  const running = db.prepare('SELECT * FROM kanban_tasks WHERE status = ?').all('running') as Task[]
  const now = Date.now()
  const freed: Task[] = []
  for (const t of running) {
    if (!t.started_at) continue
    const started = new Date(t.started_at).getTime()
    if (now - started >= staleTimeoutMs) {
      const newRetry = (t.retry_count || 0) + 1
      db.prepare("UPDATE kanban_tasks SET status = 'ready', retry_count = ?, started_at = NULL, assignee = NULL, updated_at = datetime('now') WHERE id = ?").run(newRetry, t.id)
      if (t.assignee) setAgentIdle(t.assignee)
      freed.push({ ...t, retry_count: newRetry })
    }
  }
  return freed
}

// ── Board progress ──

export function updateBoardProgress(boardId: string): void {
  const db = getDb()
  const tasks = listTasks(boardId)
  const total = tasks.length
  const completed = tasks.filter(t => t.status === 'completed' || t.status === 'archived').length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  db.prepare('UPDATE kanban_boards SET task_count = ?, completed_count = ?, progress_pct = ?, updated_at = datetime(\'now\') WHERE id = ?').run(total, completed, pct, boardId)
}

// ── Agent sessions ──

export function registerAgent(agentId: string, skills?: string[]): void {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM agent_sessions WHERE agent_id = ?').get(agentId)
  if (existing) return
  db.prepare(`INSERT INTO agent_sessions (agent_id, status, current_task_id, consecutive_failures, skills, last_heartbeat, created_at, updated_at)
    VALUES (?, 'idle', NULL, 0, ?, datetime('now'), datetime('now'), datetime('now'))`).run(
    agentId, skills ? JSON.stringify(skills) : null
  )
}

export function setAgentBusy(agentId: string, taskId: string): void {
  getDb().prepare("UPDATE agent_sessions SET status = 'busy', current_task_id = ?, updated_at = datetime('now') WHERE agent_id = ?").run(taskId, agentId)
}

export function setAgentIdle(agentId: string): void {
  getDb().prepare("UPDATE agent_sessions SET status = 'idle', current_task_id = NULL, updated_at = datetime('now') WHERE agent_id = ?").run(agentId)
}

export function getIdleAgents(): AgentSession[] {
  return getDb().prepare('SELECT * FROM agent_sessions WHERE status = ?').all('idle') as AgentSession[]
}

export function incrementAgentFailures(agentId: string): number {
  const agent = getDb().prepare('SELECT * FROM agent_sessions WHERE agent_id = ?').get(agentId) as AgentSession | undefined
  if (!agent) return 0
  const current = Number(agent.consecutive_failures) || 0
  const newCount = current + 1
  getDb().prepare('UPDATE agent_sessions SET consecutive_failures = ?, updated_at = datetime(\'now\') WHERE agent_id = ?').run(newCount, agentId)
  if (newCount >= 3) setAgentOffline(agentId)
  return newCount
}

export function resetAgentFailures(agentId: string): void {
  getDb().prepare("UPDATE agent_sessions SET consecutive_failures = 0, updated_at = datetime('now') WHERE agent_id = ?").run(agentId)
}

export function getOfflineAgents(): AgentSession[] {
  return getDb().prepare('SELECT * FROM agent_sessions WHERE status = ?').all('offline') as AgentSession[]
}

export function setAgentOffline(agentId: string): void {
  getDb().prepare("UPDATE agent_sessions SET status = 'offline', updated_at = datetime('now') WHERE agent_id = ?").run(agentId)
}

export function heartbeatAgent(agentId: string): void {
  getDb().prepare("UPDATE agent_sessions SET last_heartbeat = datetime('now'), updated_at = datetime('now') WHERE agent_id = ?").run(agentId)
}

export function getAllAgentSessions(): AgentSession[] {
  return getDb().prepare('SELECT * FROM agent_sessions ORDER BY updated_at DESC').all() as AgentSession[]
}

export function touchAgent(agentId: string): void {
  const existing = getDb().prepare('SELECT * FROM agent_sessions WHERE agent_id = ?').get(agentId) as AgentSession | undefined
  if (!existing) return
  const newStatus = existing.status === 'offline' ? 'idle' : existing.status
  getDb().prepare("UPDATE agent_sessions SET last_heartbeat = datetime('now'), updated_at = datetime('now'), status = ? WHERE agent_id = ?").run(newStatus, agentId)
}
