import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { STORE_DIR } from './config.js'
import { mkdirSync, existsSync } from 'fs'

let db: DatabaseSync

export function initDatabase(dbPath?: string): DatabaseSync {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true })
  }

  db = new DatabaseSync(dbPath ?? join(STORE_DIR, 'opencode.sqlite'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  runMigrations()
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some(c => c.name === column)
}

function runMigrations(): void {
  const existing = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  const tables = new Set(existing.map(r => r.name))

  if (!tables.has('sessions')) {
    db.exec(`CREATE TABLE sessions (
      chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'main',
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, agent_id)
    )`)
  }

  if (!tables.has('hive_mind')) {
    db.exec(`CREATE TABLE hive_mind (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      chat_id TEXT,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      artifacts TEXT,
      created_at TEXT NOT NULL
    )`)
  }

  if (!tables.has('inter_agent_tasks')) {
    db.exec(`CREATE TABLE inter_agent_tasks (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      prompt TEXT NOT NULL,
      title TEXT,
      session_id TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`)
  } else {
    if (!hasColumn('inter_agent_tasks', 'session_id')) db.exec('ALTER TABLE inter_agent_tasks ADD COLUMN session_id TEXT')
    if (!hasColumn('inter_agent_tasks', 'title')) db.exec('ALTER TABLE inter_agent_tasks ADD COLUMN title TEXT')
    if (!hasColumn('inter_agent_tasks', 'progress')) db.exec('ALTER TABLE inter_agent_tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0')
  }

  if (!tables.has('delegation_sessions')) {
    db.exec(`CREATE TABLE delegation_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      user_request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      task_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)
  }

  if (!tables.has('scheduled_tasks')) {
    db.exec(`CREATE TABLE scheduled_tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL DEFAULT 'main',
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_run TEXT,
      last_result TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`)
    db.exec(`CREATE INDEX idx_scheduled_tasks_status_next ON scheduled_tasks(status, next_run)`)
  } else {
    if (!hasColumn('scheduled_tasks', 'consecutive_failures')) {
      db.exec('ALTER TABLE scheduled_tasks ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0')
    }
  }

  if (!tables.has('mission_tasks')) {
    db.exec(`CREATE TABLE mission_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      assigned_agent TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 3,
      result TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`)
  }

  if (!tables.has('audit_log')) {
    db.exec(`CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'main',
      chat_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      blocked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  }

  if (!tables.has('meet_sessions')) {
    db.exec(`CREATE TABLE meet_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL DEFAULT 'main',
      meet_url TEXT NOT NULL,
      bot_name TEXT,
      voice_id TEXT,
      image_path TEXT,
      brief_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      platform TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'pika',
      created_at TEXT NOT NULL,
      ended_at TEXT
    )`)
  }

  if (!tables.has('turns')) {
    db.exec(`CREATE TABLE turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'main',
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`)
  }

  if (!tables.has('kanban_boards')) {
    db.exec(`CREATE TABLE kanban_boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      priority INTEGER DEFAULT 3,
      owner TEXT NOT NULL,
      summary TEXT,
      task_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      progress_pct INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )`)
  }

  if (!tables.has('kanban_tasks')) {
    db.exec(`CREATE TABLE kanban_tasks (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      parent_task_id TEXT,
      title TEXT NOT NULL,
      prompt TEXT,
      assignee TEXT,
      status TEXT DEFAULT 'triage',
      priority INTEGER DEFAULT 3,
      task_type TEXT DEFAULT 'nim',
      depends_on TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      progress INTEGER DEFAULT 0,
      result TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`)
  } else {
    // Idempotent migration: add task_type column if it doesn't exist yet
    try {
      db.exec(`ALTER TABLE kanban_tasks ADD COLUMN task_type TEXT DEFAULT 'nim'`)
    } catch {
      // Column already exists — ignore
    }
  }

  if (!tables.has('agent_sessions')) {
    db.exec(`CREATE TABLE agent_sessions (
      agent_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      consecutive_failures INTEGER DEFAULT 0,
      skills TEXT,
      progress INTEGER DEFAULT 0,
      task_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      last_heartbeat TEXT,
      created_at TEXT,
      updated_at TEXT
    )`)
  }
}

// Sessions
export function getSession(chatId: string, agentId = 'main'): string | undefined {
  const row = db.prepare('SELECT session_id FROM sessions WHERE chat_id = ? AND agent_id = ?').get(chatId, agentId) as { session_id: string } | undefined
  return row?.session_id
}

export function setSession(chatId: string, sessionId: string, agentId = 'main'): void {
  db.prepare('INSERT OR REPLACE INTO sessions (chat_id, agent_id, session_id, updated_at) VALUES (?, ?, ?, ?)').run(chatId, agentId, sessionId, Date.now())
}

export function clearSession(chatId: string, agentId = 'main'): void {
  db.prepare('DELETE FROM sessions WHERE chat_id = ? AND agent_id = ?').run(chatId, agentId)
}

// Memories (stub — memory system removed, table may not exist)
export function getMemoriesByAgent(_agentId: string, _limit = 50): unknown[] {
  return []
}

// Hive Mind
export function runSalienceDecay(): void {
  // no-op: memory system removed
}

export function insertHiveEntry(entry: { id: string; agent_id: string; chat_id?: string; action: string; summary: string; artifacts?: string }): void {
  db.prepare(`INSERT INTO hive_mind (id, agent_id, chat_id, action, summary, artifacts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    entry.id, entry.agent_id, entry.chat_id ?? null, entry.action, entry.summary, entry.artifacts ?? null
  )
}

export function getRecentHiveEntries(limit = 20): unknown[] {
  return db.prepare('SELECT * FROM hive_mind ORDER BY created_at DESC LIMIT ?').all(limit)
}

// Inter-agent tasks
export function insertInterAgentTask(task: { id: string; from_agent: string; to_agent: string; prompt: string }): void {
  db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', datetime('now'))`).run(task.id, task.from_agent, task.to_agent, task.prompt)
}

export function getTasksForAgent(agentId: string): unknown[] {
  return db.prepare('SELECT * FROM inter_agent_tasks WHERE to_agent = ? AND status = \'pending\' ORDER BY created_at ASC').all(agentId)
}

// Scheduled Tasks
export function insertScheduledTask(task: { id: string; agent_id: string; chat_id: string; prompt: string; schedule: string; next_run: string }): void {
  db.prepare(`INSERT INTO scheduled_tasks (id, agent_id, chat_id, prompt, schedule, next_run, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(task.id, task.agent_id, task.chat_id, task.prompt, task.schedule, task.next_run)
}

export function getDueTasks(now: string): unknown[] {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE status = \'active\' AND next_run <= ?').all(now)
}

export function markTaskRunning(id: string): void {
  db.prepare('UPDATE scheduled_tasks SET status = \'running\' WHERE id = ?').run(id)
}

export function updateTaskAfterRun(id: string, result: string, nextRun: string): void {
  db.prepare('UPDATE scheduled_tasks SET last_run = datetime(\'now\'), last_result = ?, next_run = ?, status = \'active\' WHERE id = ?').run(result, nextRun, id)
}

export function pauseTask(id: string): void {
  db.prepare('UPDATE scheduled_tasks SET status = \'paused\' WHERE id = ?').run(id)
}

export function resumeTask(id: string, nextRun: string): void {
  db.prepare('UPDATE scheduled_tasks SET status = \'active\', next_run = ? WHERE id = ?').run(nextRun, id)
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
}

export function listScheduledTasks(agentId?: string): unknown[] {
  if (agentId) return db.prepare('SELECT * FROM scheduled_tasks WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
  return db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all()
}

export function resetStuckTasks(): void {
  db.exec("UPDATE scheduled_tasks SET status = 'active' WHERE status = 'running'")
}

export function incrementTaskFailures(id: string): void {
  db.prepare('UPDATE scheduled_tasks SET consecutive_failures = consecutive_failures + 1 WHERE id = ?').run(id)
}

export function resetTaskFailures(id: string): void {
  db.prepare('UPDATE scheduled_tasks SET consecutive_failures = 0 WHERE id = ?').run(id)
}

export function getTaskFailures(id: string): number {
  const row = db.prepare('SELECT consecutive_failures FROM scheduled_tasks WHERE id = ?').get(id) as { consecutive_failures: number } | undefined
  return row?.consecutive_failures ?? 0
}

// Mission Tasks
export function insertMission(mission: { id: string; title: string; prompt: string; assigned_agent?: string; priority?: number }): void {
  db.prepare(`INSERT INTO mission_tasks (id, title, prompt, assigned_agent, status, priority, created_at)
    VALUES (?, ?, ?, ?, 'queued', ?, datetime('now'))`).run(
    mission.id, mission.title, mission.prompt, mission.assigned_agent ?? null, mission.priority ?? 3
  )
}

export function getNextQueuedMission(): unknown {
  return db.prepare("SELECT * FROM mission_tasks WHERE status = 'queued' ORDER BY priority ASC, created_at ASC LIMIT 1").get()
}

export function completeMission(id: string, result: string): void {
  db.prepare("UPDATE mission_tasks SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?").run(result, id)
}

export function cancelMission(id: string): void {
  db.prepare("UPDATE mission_tasks SET status = 'cancelled' WHERE id = ?").run(id)
}

export function listMissions(): unknown[] {
  return db.prepare('SELECT * FROM mission_tasks ORDER BY priority ASC, created_at ASC').all()
}

// Audit Log
export function insertAuditEntry(entry: { agent_id: string; chat_id: string; action: string; detail?: string; blocked?: boolean }): void {
  db.prepare('INSERT INTO audit_log (agent_id, chat_id, action, detail, blocked) VALUES (?, ?, ?, ?, ?)').run(
    entry.agent_id, entry.chat_id, entry.action, entry.detail ?? null, entry.blocked ? 1 : 0
  )
}

export function getAuditEntries(agentId?: string, limit = 100): unknown[] {
  if (agentId) return db.prepare('SELECT * FROM audit_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').all(agentId, limit)
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit)
}

// Turns
export function insertTurn(chatId: string, role: 'user' | 'assistant', content: string, agentId = 'main'): void {
  db.prepare('INSERT INTO turns (chat_id, agent_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(chatId, agentId, role, content, Date.now())
}

export function getRecentTurns(chatId: string, agentId = 'main', limit = 10): unknown[] {
  return db.prepare('SELECT * FROM (SELECT * FROM turns WHERE chat_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC').all(chatId, agentId, limit)
}

export function pruneOldTurns(chatId: string, agentId = 'main', keep = 50): void {
  db.prepare(`DELETE FROM turns WHERE chat_id = ? AND agent_id = ? AND id NOT IN (
    SELECT id FROM turns WHERE chat_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT ?
  )`).run(chatId, agentId, chatId, agentId, keep)
}

// Meet Sessions
export function insertMeetSession(session: {
  id: string; agent_id: string; meet_url: string; bot_name?: string; platform: string; provider?: string
}): void {
  db.prepare(`INSERT INTO meet_sessions (id, agent_id, meet_url, bot_name, platform, provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    session.id, session.agent_id, session.meet_url, session.bot_name ?? null, session.platform, session.provider ?? 'pika'
  )
}

export function updateMeetSessionStatus(id: string, status: string): void {
  db.prepare('UPDATE meet_sessions SET status = ? WHERE id = ?').run(status, id)
}

export function getActiveMeetSessions(): unknown[] {
  return db.prepare("SELECT * FROM meet_sessions WHERE status = 'active'").all()
}

export function listMeetSessions(limit = 20): unknown[] {
  return db.prepare('SELECT * FROM meet_sessions ORDER BY created_at DESC LIMIT ?').all(limit)
}

// Delegation Sessions
export function createDelegationSession(session: {
  id: string; chat_id: string; user_request: string
}): void {
  db.prepare(`INSERT INTO delegation_sessions (id, chat_id, user_request, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`).run(session.id, session.chat_id, session.user_request)
}

export function getDelegationSession(id: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM delegation_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
}

export function updateDelegationSessionStatus(id: string, status: string): void {
  db.prepare("UPDATE delegation_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

export function updateDelegationSessionCounts(id: string): void {
  db.prepare(`UPDATE delegation_sessions SET
    task_count = (SELECT COUNT(*) FROM inter_agent_tasks WHERE session_id = ?),
    completed_count = (SELECT COUNT(*) FROM inter_agent_tasks WHERE session_id = ? AND status = 'completed'),
    updated_at = datetime('now')
    WHERE id = ?`).run(id, id, id)
}

export function getActiveDelegationSessions(): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM delegation_sessions WHERE status = 'active' ORDER BY created_at DESC").all() as Record<string, unknown>[]
}

export function delegateTask(task: {
  id: string; from_agent: string; to_agent: string; prompt: string; session_id: string; title?: string
}): void {
  db.prepare(`INSERT INTO inter_agent_tasks (id, from_agent, to_agent, prompt, title, session_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`).run(
    task.id, task.from_agent, task.to_agent, task.prompt, task.title ?? null, task.session_id
  )
}

export function getSessionTasks(sessionId: string): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM inter_agent_tasks WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Record<string, unknown>[]
}

export function getPendingTasks(): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM inter_agent_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5").all() as Record<string, unknown>[]
}

export function claimTask(taskId: string): void {
  db.prepare("UPDATE inter_agent_tasks SET status = 'running' WHERE id = ? AND status = 'pending'").run(taskId)
}

export function completeTask(taskId: string, result: string): void {
  db.prepare("UPDATE inter_agent_tasks SET status = 'completed', result = ?, progress = 100, completed_at = datetime('now') WHERE id = ?").run(result, taskId)
}
