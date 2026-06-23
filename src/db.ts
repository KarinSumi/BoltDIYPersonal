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

  if (!tables.has('memories')) {
    db.exec(`CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'main',
      summary TEXT NOT NULL,
      raw_text TEXT,
      entities TEXT,
      topics TEXT,
      importance REAL NOT NULL DEFAULT 0.5,
      salience REAL NOT NULL DEFAULT 1.0,
      pinned INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      consolidated INTEGER NOT NULL DEFAULT 0,
      embedding TEXT,
      created_at TEXT NOT NULL,
      last_accessed TEXT
    )`)
  }

  if (!tables.has('memories_fts')) {
    db.exec(`CREATE VIRTUAL TABLE memories_fts USING fts5(
      summary, raw_text, entities, topics,
      content='memories',
      content_rowid='rowid'
    )`)
    db.exec(`CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, summary, raw_text, entities, topics)
      VALUES (new.rowid, new.summary, new.raw_text, new.entities, new.topics);
    END`)
    db.exec(`CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, summary, raw_text, entities, topics)
      VALUES ('delete', old.rowid, old.summary, old.raw_text, old.entities, old.topics);
    END`)
    db.exec(`CREATE TRIGGER memories_au AFTER UPDATE OF summary, raw_text, entities, topics ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, summary, raw_text, entities, topics)
      VALUES ('delete', old.rowid, old.summary, old.raw_text, old.entities, old.topics);
      INSERT INTO memories_fts(rowid, summary, raw_text, entities, topics)
      VALUES (new.rowid, new.summary, new.raw_text, new.entities, new.topics);
    END`)
  }

  if (!tables.has('consolidations')) {
    db.exec(`CREATE TABLE consolidations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL DEFAULT 'main',
      insights TEXT NOT NULL,
      patterns TEXT,
      contradictions TEXT,
      memory_ids TEXT,
      created_at TEXT NOT NULL
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
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
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
      created_at TEXT NOT NULL
    )`)
    db.exec(`CREATE INDEX idx_scheduled_tasks_status_next ON scheduled_tasks(status, next_run)`)
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

// Memories
export function insertMemory(mem: {
  id: string; chat_id: string; agent_id: string; summary: string; raw_text?: string
  entities?: string; topics?: string; importance: number; salience: number; embedding?: string
}): void {
  db.prepare(`INSERT INTO memories (id, chat_id, agent_id, summary, raw_text, entities, topics, importance, salience, embedding, created_at, last_accessed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
    mem.id, mem.chat_id, mem.agent_id, mem.summary, mem.raw_text ?? null,
    mem.entities ?? null, mem.topics ?? null, mem.importance, mem.salience, mem.embedding ?? null
  )
}

export function getMemoriesByAgent(agentId: string, limit = 50): unknown[] {
  return db.prepare('SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').all(agentId, limit)
}

export function getUnconsolidatedMemories(agentId: string, limit = 20): unknown[] {
  return db.prepare('SELECT * FROM memories WHERE agent_id = ? AND consolidated = 0 LIMIT ?').all(agentId, limit)
}

export function markMemoriesConsolidated(ids: string[]): void {
  const stmt = db.prepare('UPDATE memories SET consolidated = 1 WHERE id = ?')
  for (const id of ids) stmt.run(id)
}

export function searchMemoriesFTS(query: string, agentId: string, limit = 5): unknown[] {
  return db.prepare(`SELECT m.* FROM memories m JOIN memories_fts f ON m.rowid = f.rowid
    WHERE memories_fts MATCH ? AND m.agent_id = ? ORDER BY rank LIMIT ?`).all(query, agentId, limit)
}

export function getAllEmbeddings(agentId: string): { id: string; embedding: string }[] {
  return db.prepare('SELECT id, embedding FROM memories WHERE agent_id = ? AND embedding IS NOT NULL').all(agentId) as { id: string; embedding: string }[]
}

export function updateSalience(id: string, newValue: number): void {
  db.prepare('UPDATE memories SET salience = ?, last_accessed = datetime(\'now\') WHERE id = ?').run(newValue, id)
}

export function pinMemory(id: string): void {
  db.prepare('UPDATE memories SET pinned = 1 WHERE id = ?').run(id)
}

export function unpinMemory(id: string): void {
  db.prepare('UPDATE memories SET pinned = 0 WHERE id = ?').run(id)
}

export function setSupersededBy(oldId: string, newId: string): void {
  db.prepare('UPDATE memories SET superseded_by = ? WHERE id = ?').run(newId, oldId)
}

export function runSalienceDecay(): void {
  db.exec(`UPDATE memories SET salience = ROUND(salience * CASE
    WHEN pinned = 1 THEN 1.0
    WHEN importance >= 0.8 THEN 0.99
    WHEN importance >= 0.5 THEN 0.98
    ELSE 0.95
  END, 4)`)
  db.exec('DELETE FROM memories WHERE salience < 0.05')
}

export function searchConversationHistory(keywords: string, agentId: string, dayWindow = 7, limit = 10): unknown[] {
  const cutoff = Date.now() - (dayWindow * 86400 * 1000)
  return db.prepare(`SELECT * FROM turns WHERE agent_id = ? AND created_at > ? AND content LIKE ?
    ORDER BY created_at DESC LIMIT ?`).all(agentId, cutoff, `%${keywords}%`, limit)
}

export function insertConsolidation(result: {
  id: string; agent_id: string; insights: string; patterns?: string; contradictions?: string; memory_ids: string
}): void {
  db.prepare(`INSERT INTO consolidations (id, agent_id, insights, patterns, contradictions, memory_ids, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    result.id, result.agent_id, result.insights, result.patterns ?? null,
    result.contradictions ?? null, result.memory_ids
  )
}

// Hive Mind
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

export function completeTask(taskId: string, result: string): void {
  db.prepare('UPDATE inter_agent_tasks SET status = \'completed\', result = ?, completed_at = datetime(\'now\') WHERE id = ?').run(result, taskId)
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
  return db.prepare('SELECT * FROM turns WHERE chat_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT ?').all(chatId, agentId, limit)
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
