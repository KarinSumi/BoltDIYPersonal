import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const PROJECT_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const DB_PATH = join(PROJECT_ROOT, 'store', 'opencode.sqlite')

if (!existsSync(DB_PATH)) {
  console.log('Database not found. Start the bot first to create it.')
  process.exit(1)
}

const db = new DatabaseSync(DB_PATH)

const existing = db.prepare("SELECT COUNT(*) as c FROM mission_tasks").get()
if (existing.c === 0) {
  const ins = db.prepare(
    "INSERT INTO mission_tasks (id, title, prompt, status, assigned_agent, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  )
  ins.run('m1', 'System Health Check', 'Run a full system diagnostics and report back on all subsystems.', 'queued', 'main', 1)
  ins.run('m2', 'Code Review Backlog', 'Review the last 5 commits in the project for issues.', 'queued', 'dev', 2)
  ins.run('m3', 'Weekly Report', 'Summarize all completed tasks and system metrics for the week.', 'completed', 'main', 0)
  console.log('Seeded 3 missions')
} else {
  console.log('Missions already exist, skipping')
}

const existingTasks = db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks").get()
if (existingTasks.c === 0) {
  const ins = db.prepare(
    "INSERT INTO scheduled_tasks (id, agent_id, chat_id, prompt, schedule, next_run, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  )
  const tomorrow = new Date(Date.now() + 86400000).toISOString()
  ins.run('t1', 'main', '8262492446', 'Check system health and report', '0 8 * * *', tomorrow, 'active')
  ins.run('t2', 'dev', '8262492446', 'Review open issues and summarize', '0 18 * * *', tomorrow, 'active')
  console.log('Seeded 2 scheduled tasks')
} else {
  console.log('Tasks already exist, skipping')
}

const existingAudit = db.prepare("SELECT COUNT(*) as c FROM audit_log").get()
if (existingAudit.c === 0) {
  const ins = db.prepare(
    "INSERT INTO audit_log (agent_id, chat_id, action, detail, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  )
  ins.run('system', 'system', 'startup', 'OpenCode OS initialized')
  ins.run('main', '8262492446', 'chat', 'User sent first message')
  ins.run('dev', '8262492446', 'delegation', 'User delegated a code review task')
  console.log('Seeded 3 audit log entries')
} else {
  console.log('Audit log already exists, skipping')
}

db.close()
console.log('Seed complete!')
