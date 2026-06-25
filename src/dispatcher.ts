import {
  releaseStaleClaims, getTasksByStatus, getTask,
  updateTask, getIdleAgents, claimTask, setAgentBusy,
  getOfflineAgents, setAgentIdle, resetAgentFailures,
  updateBoardProgress, advanceDependencies,
} from './kanban-db.js'
import { logger } from './logger.js'

export interface DispatcherStats {
  freed: number
  promoted: number
  assigned: number
  failed: number
  recovered: number
  boardsUpdated: number
}

const STALE_TIMEOUT = 300_000
const CHECK_INTERVAL = 10_000

let running = false
let ticking = false
let timer: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0

export function startDispatcher(): void {
  if (running) return
  running = true
  logger.info('Dispatcher started (10s interval)')
  timer = setInterval(() => {
    tick().catch(err => logger.error({ err: (err as Error).message }, 'Dispatcher tick error'))
  }, CHECK_INTERVAL)
}

export function stopDispatcher(): void {
  running = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  logger.info('Dispatcher stopped')
}

export function getDispatcherStatus(): { running: boolean; lastTickAt: number } {
  return { running, lastTickAt }
}

export async function tick(): Promise<DispatcherStats> {
  if (ticking) return { freed: 0, promoted: 0, assigned: 0, failed: 0, recovered: 0, boardsUpdated: 0 }
  ticking = true
  const changedBoards = new Set<string>()
  let freed = 0, promoted = 0, assigned = 0, failed = 0, recovered = 0

  try {
    try {
      const staleTasks = releaseStaleClaims(STALE_TIMEOUT)
      freed = staleTasks.length
      for (const t of staleTasks) { if (t.board_id) changedBoards.add(t.board_id) }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: stale claims failed')
    }

    try {
      const triageTasks = getTasksByStatus('triage')
      for (const t of triageTasks) {
        let deps: string[] = []
        try { deps = t.depends_on ? JSON.parse(t.depends_on) : [] } catch { /* skip */ }
        const allMet = deps.length === 0 || deps.every(d => {
          const dep = getTask(d)
          return dep && dep.status === 'completed'
        })
        if (allMet) { updateTask(t.id, { status: 'ready' }); promoted++; changedBoards.add(t.board_id) }
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: promote triage failed')
    }

    try {
      for (const t of getTasksByStatus('completed')) {
        advanceDependencies(t.id)
        changedBoards.add(t.board_id)
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: advance deps failed')
    }

    try {
      const readyTasks = getTasksByStatus('ready').filter(t => !t.assignee)
      const idleAgents = getIdleAgents()
      for (const task of readyTasks) {
        const agent = idleAgents.shift()
        if (!agent) break
        claimTask(task.id, agent.agent_id)
        setAgentBusy(agent.agent_id, task.id)
        assigned++
        changedBoards.add(task.board_id)
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: assign ready failed')
    }

    try {
      for (const t of getTasksByStatus('failed')) {
        if (t.retry_count < t.max_retries) {
          updateTask(t.id, { status: 'ready', retry_count: t.retry_count + 1 })
          failed++
          changedBoards.add(t.board_id)
        }
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: handle failures failed')
    }

    try {
      for (const agent of getOfflineAgents()) {
        setAgentIdle(agent.agent_id)
        resetAgentFailures(agent.agent_id)
        recovered++
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: circuit breaker failed')
    }

    try {
      for (const boardId of changedBoards) { updateBoardProgress(boardId) }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Dispatcher tick: update progress failed')
    }

    lastTickAt = Date.now()
  } finally {
    ticking = false
  }

  return { freed, promoted, assigned, failed, recovered, boardsUpdated: changedBoards.size }
}
