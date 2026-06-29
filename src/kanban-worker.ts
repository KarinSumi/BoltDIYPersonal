import { queryAgent } from './opencode-agent.js'
import { classifyError } from './errors.js'
import { promptOpenCode } from './opencode-runner.js'
import { isOpenCodeServerReady } from './opencode-server.js'
import { getTasksByStatus, completeTask, failTask, setAgentIdle, resetAgentFailures, incrementAgentFailures, Task } from './kanban-db.js'
import { logger } from './logger.js'
import { chatEvents } from './state.js'

const POLL_INTERVAL = 3_000
const MAX_RETRIES = 1
const MAX_CONCURRENCY = 3
const RETRY_BACKOFF_MS: number[] = [1_000, 10_000]
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

async function executeTask(task: Task): Promise<void> {
  const agentId = task.assignee || 'unknown'
  const taskType = task.task_type ?? 'nim'
  logger.info({ taskId: task.id, agentId, title: task.title, taskType }, 'Executing kanban task')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let output: string

      if (taskType === 'opencode' && isOpenCodeServerReady()) {
        // Deep task: OpenCode server
        logger.info({ taskId: task.id }, 'Routing to OpenCode server')
        const result = await promptOpenCode({
          chatId: task.board_id,
          prompt: task.prompt,
          sessionTitle: task.title,
        })
        output = result.text
      } else {
        // Fast task: NIM LLM (or fallback when OpenCode unavailable)
        if (taskType === 'opencode') {
          logger.warn({ taskId: task.id }, 'OpenCode not ready, falling back to NIM LLM')
        }
        const systemPrompt = `You are a specialist agent "${agentId}". Execute the following task and return ONLY the result. Be thorough and complete.`
        const result = await queryAgent({
          messages: [{ role: 'user', content: task.prompt }],
          systemPrompt,
          maxTurns: 10,
        })
        output = result.text || 'No output generated.'
      }

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
        const { category } = classifyError(err as Error)
        const delay = RETRY_BACKOFF_MS[attempt] || 30_000
        logger.info({ taskId: task.id, attempt: attempt + 1, delayMs: delay, category }, 'Retrying kanban task')
        await new Promise(r => setTimeout(r, delay))
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
