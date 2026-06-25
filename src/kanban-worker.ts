import { queryAgent } from './opencode-agent.js'
import { getTasksByStatus, completeTask, failTask, setAgentIdle, resetAgentFailures, incrementAgentFailures } from './kanban-db.js'
import { logger } from './logger.js'
import { chatEvents } from './state.js'

const POLL_INTERVAL = 3_000
const MAX_RETRIES = 1
const MAX_CONCURRENCY = 3
const inFlight = new Set<string>()

let running = false
let timer: ReturnType<typeof setInterval> | null = null
let activeTasks = 0
const activePromises: Promise<void>[] = []

export function startKanbanWorker(): void {
  if (running) return
  running = true
  logger.info('Kanban worker started (polling every 3s)')
  processRunningTasks().catch(err => logger.error({ err: (err as Error).message }, 'Kanban worker first tick error'))
  timer = setInterval(() => {
    processRunningTasks().catch(err => logger.error({ err: (err as Error).message }, 'Kanban worker error'))
  }, POLL_INTERVAL)
}

export async function stopKanbanWorker(): Promise<void> {
  running = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (activePromises.length > 0) {
    logger.info({ count: activePromises.length }, 'Draining active kanban tasks')
    await Promise.allSettled(activePromises)
  }
  inFlight.clear()
  activePromises.length = 0
  logger.info('Kanban worker stopped')
}

export function clearInFlight(): void {
  inFlight.clear()
}

async function processRunningTasks(): Promise<void> {
  if (!running) return
  const runningTasks = getTasksByStatus('running').filter(t => t.assignee && !inFlight.has(t.id))

  for (const task of runningTasks) {
    if (activeTasks >= MAX_CONCURRENCY) break
    activeTasks++
    inFlight.add(task.id)
    const p = executeTask(task).finally(() => {
      inFlight.delete(task.id)
      activeTasks--
    })
    activePromises.push(p)
    p.then(() => {
      const idx = activePromises.indexOf(p)
      if (idx !== -1) activePromises.splice(idx, 1)
    })
  }
}

async function executeTask(task: { id: string; assignee: string | null; prompt: string; title: string; board_id: string }): Promise<void> {
  const agentId = task.assignee || 'unknown'
  logger.info({ taskId: task.id, agentId, title: task.title }, 'Executing kanban task')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemPrompt = `You are a specialist agent "${agentId}". Execute the following task and return ONLY the result. Be thorough and complete.`

      const result = await queryAgent({
        messages: [{ role: 'user', content: task.prompt }],
        systemPrompt,
        maxTurns: 10,
      })

      const output = result.text || 'No output generated.'
      completeTask(task.id, output)
      setAgentIdle(agentId)
      resetAgentFailures(agentId)

      chatEvents.emit('task', {
        taskId: task.id,
        agentId,
        status: 'completed',
        timestamp: Date.now(),
      })

      logger.info({ taskId: task.id, agentId }, 'Kanban task completed')
      return
    } catch (err) {
      const msg = (err as Error).message
      logger.error({ taskId: task.id, agentId, attempt: attempt + 1, err: msg }, 'Kanban task attempt failed')

      if (attempt < MAX_RETRIES) {
        logger.info({ taskId: task.id }, 'Retrying kanban task')
        continue
      }
    }
  }

  // All retries exhausted
  const errMsg = 'All retries exhausted'
  failTask(task.id, errMsg)
  setAgentIdle(agentId)
  incrementAgentFailures(agentId)

  chatEvents.emit('task', {
    taskId: task.id,
    agentId,
    status: 'failed',
    timestamp: Date.now(),
  })

  logger.error({ taskId: task.id, agentId }, 'Kanban task failed after all retries')
}
