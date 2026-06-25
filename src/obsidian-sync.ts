import { readFileSync, writeFileSync, existsSync, mkdirSync, watch } from 'fs'
import { join, basename, extname } from 'path'
import { getBoard, getTask, listTasks, updateTask } from './kanban-db.js'
import { getDb } from './db.js'
import { logger } from './logger.js'

function getObsidianVaultPath(): string {
  return process.env['OBSIDIAN_VAULT_PATH'] ?? ''
}

const VALID_KANBAN_DIR = 'kanban'

function getVaultDir(): string | null {
  const vaultPath = getObsidianVaultPath()
  if (!vaultPath) return null
  const dir = join(vaultPath, VALID_KANBAN_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function statusToMarker(status: string): string {
  switch (status) {
    case 'completed': return 'x'
    case 'failed': return '-'
    case 'running': return '/'
    case 'ready': return '>'
    case 'blocked': return '!'
    case 'cancelled': return '~'
    case 'paused': return 'p'
    default: return ' '
  }
}

function markerToStatus(marker: string): string {
  switch (marker) {
    case 'x': return 'completed'
    case '-': return 'failed'
    case '/': return 'running'
    case '>': return 'ready'
    case '!': return 'blocked'
    case '~': return 'cancelled'
    case 'p': return 'paused'
    default: return 'triage'
  }
}

export function boardToMarkdown(boardId: string): string {
  const board = getBoard(boardId)
  if (!board) return ''

  const tasks = listTasks(boardId)
  const lines: string[] = [
    `# ${board.title}`,
    `> status: ${board.status} | progress: ${board.progress_pct}%${board.description ? ` | description: ${board.description}` : ''}`,
    '',
  ]

  for (const t of tasks) {
    const marker = statusToMarker(t.status)
    const resultSuffix = t.result ? ` — ${t.result.slice(0, 100)}` : ''
    lines.push(`- [${marker}] ${t.title} (task_id:: ${t.id})${resultSuffix}`)
  }

  tasks.length === 0 && lines.push('_No tasks_')

  return lines.join('\n') + '\n'
}

export function markdownToBoardDeltas(md: string): Array<{ taskId: string; status: string }> {
  const deltas: Array<{ taskId: string; status: string }> = []
  const taskLineRegex = /-\s*\[(.)\]\s+.*?task_id::\s*(\S+)/g
  let match: RegExpExecArray | null

  while ((match = taskLineRegex.exec(md)) !== null) {
    const marker = match[1]
    const taskId = match[2].replace(/[^a-zA-Z0-9-]/g, '')
    const status = markerToStatus(marker)
    deltas.push({ taskId, status })
  }

  return deltas
}

export function syncBoardToFile(boardId: string): string | null {
  const vaultDir = getVaultDir()
  if (!vaultDir) return null

  const md = boardToMarkdown(boardId)
  if (!md) return null

  const filePath = join(vaultDir, `${boardId}.md`)
  writeFileSync(filePath, md, 'utf-8')
  logger.info({ boardId, filePath }, 'Board synced to Obsidian')
  return filePath
}

export function syncFileToBoard(filePath: string): void {
  const vaultDir = getVaultDir()
  if (!vaultDir) return

  const name = basename(filePath, extname(filePath))
  // Validate it's a UUID-shaped board ID
  if (!/^[0-9a-f-]{36}$/.test(name)) return

  const md = readFileSync(filePath, 'utf-8')
  const deltas = markdownToBoardDeltas(md)
  if (deltas.length === 0) return

  // Check board exists
  const board = getBoard(name)
  if (!board) return

  for (const d of deltas) {
    const task = getTask(d.taskId)
    if (!task || task.board_id !== name) continue
    // Only apply if the new status is different
    if (task.status !== d.status) {
      updateTask(d.taskId, { status: d.status })
      logger.info({ taskId: d.taskId, newStatus: d.status }, 'Task status synced from Obsidian')
    }
  }
}

export function syncAllBoardsToFiles(): number {
  const db = getDb()
  const boards = db.prepare('SELECT id FROM kanban_boards WHERE status != ?').all('archived') as Array<{ id: string }>
  let count = 0
  for (const b of boards) {
    const result = syncBoardToFile(b.id)
    if (result) count++
  }
  logger.info({ count }, 'All boards synced to Obsidian')
  return count
}

// ── File watcher (uses built-in fs.watch, no chokidar dependency) ──

let watcher: ReturnType<typeof watch> | null = null
let _watcherActive = false
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function obsidianWatcherActive(): boolean {
  return _watcherActive
}

export function startObsidianWatcher(): void {
  if (_watcherActive) return
  const vaultDir = getVaultDir()
  if (!vaultDir) {
    logger.warn('Cannot start Obsidian watcher: vault not configured')
    return
  }

  watcher = watch(vaultDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return

    // On rename/delete, clean up pending timer for old filename
    if (eventType === 'rename') {
      const existing = debounceTimers.get(filename)
      if (existing) {
        clearTimeout(existing)
        debounceTimers.delete(filename)
      }
      if (!existsSync(join(vaultDir, filename))) return
    }

    // Debounce: wait 500ms after last change before syncing
    const existing = debounceTimers.get(filename)
    if (existing) clearTimeout(existing)

    debounceTimers.set(filename, setTimeout(() => {
      debounceTimers.delete(filename)
      const filePath = join(vaultDir, filename)
      if (!existsSync(filePath)) return
      try {
        syncFileToBoard(filePath)
        logger.info({ filename }, 'Obsidian file synced to kanban')
      } catch (err) {
        logger.error({ err: (err as Error).message, filename }, 'Failed to sync Obsidian file')
      }
    }, 500))
  })

  _watcherActive = true
  logger.info({ vaultDir }, 'Obsidian file watcher started')
}

export function stopObsidianWatcher(): void {
  if (!_watcherActive) return
  if (watcher) {
    watcher.close()
    watcher = null
  }
  // Clear all pending debounce timers
  for (const [filename, timer] of debounceTimers) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  _watcherActive = false
  logger.info('Obsidian file watcher stopped')
}
