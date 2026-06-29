import cronParser from 'cron-parser'
const { parseExpression } = cronParser
import { getDueTasks, markTaskRunning, updateTaskAfterRun, resetStuckTasks, getNextQueuedMission, completeMission, incrementTaskFailures, resetTaskFailures, getTaskFailures, pauseTask } from './db.js'
import { queryAgent } from './opencode-agent.js'
import { classifyError } from './errors.js'
import { logger } from './logger.js'
const SCHEDULER_TASK_TIMEOUT_MS = 1_200_000
const MAX_SCHEDULED_FAILURES = 3

type Sender = (chatId: string, text: string) => Promise<void>

let schedulerInterval: ReturnType<typeof setInterval> | null = null
const inFlightTasks = new Set<string>()

export function initScheduler(send: Sender, agentId = 'main'): void {
  resetStuckTasks()
  logger.info('Scheduler initialized with 60s polling')

  const jitter = Math.random() * 10000
  setTimeout(() => {
    schedulerInterval = setInterval(async () => {
      await processDueTasks(send, agentId)
      await processMissions(agentId)
    }, 60_000)
  }, jitter)
}

export async function stopScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
  if (inFlightTasks.size > 0) {
    logger.info({ count: inFlightTasks.size }, 'Draining in-flight scheduled tasks')
    await new Promise<void>(resolve => {
      const check = (): void => {
        if (inFlightTasks.size === 0) resolve()
        else setTimeout(check, 500)
      }
      check()
    })
  }
}

async function processDueTasks(send: Sender, agentId: string): Promise<void> {
  const now = new Date().toISOString()
  const dueTasks = getDueTasks(now) as Array<{
    id: string; prompt: string; chat_id: string; schedule: string; agent_id: string
  }>

  for (const task of dueTasks) {
    const ac = new AbortController()
    const timeoutId = setTimeout(() => ac.abort(), SCHEDULER_TASK_TIMEOUT_MS)
    inFlightTasks.add(task.id)

    try {
      markTaskRunning(task.id)

      const result = await queryAgent({
        messages: [{ role: 'user', content: task.prompt }],
        agentId: task.agent_id || agentId,
        systemPrompt: 'You are running an automated scheduled task. Execute the prompt and return the result concisely.',
        signal: ac.signal,
      }) as { text: string | null }

      clearTimeout(timeoutId)
      resetTaskFailures(task.id)

      const nextRun = computeNextRun(task.schedule)
      updateTaskAfterRun(task.id, result.text ?? 'No output', nextRun)

      await send(task.chat_id, `✅ Scheduled task completed:\n${result.text ?? 'No output'}`)
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = (err as Error).message
      const { category, recovery } = classifyError(err as Error)

      incrementTaskFailures(task.id)
      const failures = getTaskFailures(task.id)

      if (failures >= MAX_SCHEDULED_FAILURES) {
        pauseTask(task.id)
        await send(task.chat_id, `❌ Task failed after ${failures} attempts: ${msg}. Task paused.`)
        continue
      }

      const retryDelay = (category === 'rate_limit' || category === 'overloaded')
        ? recovery.retryAfterMs * Math.pow(2, failures - 1) + Math.random() * 5000
        : 0
      const nextRun = retryDelay > 0
        ? new Date(Date.now() + retryDelay).toISOString()
        : computeNextRun(task.schedule)

      updateTaskAfterRun(task.id, `Error: ${msg}`, nextRun)

      if (category !== 'rate_limit' && category !== 'overloaded') {
        await send(task.chat_id, `❌ Task failed: ${msg}`)
      }
    } finally {
      clearTimeout(timeoutId)
      inFlightTasks.delete(task.id)
    }
  }
}

async function processMissions(_agentId: string): Promise<void> {
  const mission = getNextQueuedMission() as { id: string; prompt: string; title: string } | undefined
  if (!mission) return

  try {
    const result = await queryAgent({
      messages: [{ role: 'user', content: mission.prompt }],
      systemPrompt: `You are executing a mission: "${mission.title}". Complete the task and return the result.`,
    })

    completeMission(mission.id, result.text ?? 'No output')
    logger.info({ missionId: mission.id }, 'Mission completed')
  } catch (err) {
    completeMission(mission.id, `Error: ${(err as Error).message}`)
  }
}

export function computeNextRun(cronExpression: string): string {
  try {
    const interval = parseExpression(cronExpression)
    return interval.next().toISOString()
  } catch {
    return new Date(Date.now() + 86400000).toISOString()
  }
}
