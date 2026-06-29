import { queryAgent } from './opencode-agent.js'
import { classifyError } from './errors.js'
import { listPendingTasks, claimPendingTask, finishTask, updateSessionCounts } from './orchestrator.js'
import { logger } from './logger.js'
import { chatEvents } from './state.js'

let running = false
let pollTimer: ReturnType<typeof setInterval> | null = null

export function startTaskWorker(): void {
  if (running) return
  running = true
  logger.info('Task worker started (polling every 2s)')

  pollTimer = setInterval(async () => {
    try {
      await processPendingTasks()
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Task worker error')
    }
  }, 2000)
}

export function stopTaskWorker(): void {
  running = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  logger.info('Task worker stopped')
}

async function processPendingTasks(): Promise<void> {
  const pending = listPendingTasks() as Array<{
    id: string; to_agent: string; prompt: string; title: string; session_id: string
  }>

  for (const task of pending) {
    claimPendingTask(task.id)

    setImmediate(() => executeTask(task))
  }
}

const MAX_RETRIES = 1
const attemptedTasks = new Set<string>()

async function executeTask(task: {
  id: string; to_agent: string; prompt: string; title: string; session_id: string
}): Promise<void> {
  logger.info({ taskId: task.id, agentId: task.to_agent, title: task.title }, 'Executing delegated task')

  try {
    const systemPrompt = `You are a specialist agent "${task.to_agent}". Execute the following task and return ONLY the result. Be thorough and complete.`

    const result = await queryAgent({
      messages: [{ role: 'user', content: task.prompt }],
      systemPrompt,
      maxTurns: 10,
    })

    const output = result.text || 'No output generated.'
    finishTask(task.id, output)

    chatEvents.emit('task', {
      taskId: task.id,
      agentId: task.to_agent,
      sessionId: task.session_id,
      status: 'completed',
      timestamp: Date.now(),
    })

    if (task.session_id) {
      updateSessionCounts(task.session_id)
    }

    logger.info({ taskId: task.id, agentId: task.to_agent }, 'Delegated task completed')
  } catch (err) {
    const msg = (err as Error).message
    logger.error({ taskId: task.id, agentId: task.to_agent, err: msg }, 'Delegated task failed')

    if (!attemptedTasks.has(task.id)) {
      attemptedTasks.add(task.id)
      const { category } = classifyError(err as Error)
      const delay = category === 'rate_limit' || category === 'overloaded' ? 30_000 : 5_000
      logger.info({ taskId: task.id, delayMs: delay, category }, 'Retrying delegated task (1 retry)')
      setTimeout(() => executeTask(task), delay)
      return
    }

    attemptedTasks.delete(task.id)
    finishTask(task.id, `Error: ${msg}`)

    if (task.session_id) {
      updateSessionCounts(task.session_id)
    }
  }
}

export function clearRetryState(): void {
  attemptedTasks.clear()
}
