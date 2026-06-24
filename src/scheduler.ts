import cronParser from 'cron-parser'
const { parseExpression } = cronParser
import { getDueTasks, markTaskRunning, updateTaskAfterRun, resetStuckTasks, getNextQueuedMission, completeMission } from './db.js'
import { queryAgent } from './opencode-agent.js'
import { logger } from './logger.js'

type Sender = (chatId: string, text: string) => Promise<void>

let schedulerInterval: ReturnType<typeof setInterval> | null = null

export function initScheduler(send: Sender, agentId = 'main'): void {
  resetStuckTasks()
  logger.info('Scheduler initialized with 60s polling')

  schedulerInterval = setInterval(async () => {
    await processDueTasks(send, agentId)
    await processMissions(agentId)
  }, 60_000)
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}

async function processDueTasks(send: Sender, agentId: string): Promise<void> {
  const now = new Date().toISOString()
  const dueTasks = getDueTasks(now) as Array<{
    id: string; prompt: string; chat_id: string; schedule: string; agent_id: string
  }>

  for (const task of dueTasks) {
    try {
      markTaskRunning(task.id)

      const timeout = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), 600_000)
      )

      const result = await Promise.race([
        queryAgent({
          messages: [{ role: 'user', content: task.prompt }],
          agentId: task.agent_id || agentId,
          systemPrompt: 'You are running an automated scheduled task. Execute the prompt and return the result concisely.',
        }),
        timeout,
      ]) as { text: string | null }

      const nextRun = computeNextRun(task.schedule)
      updateTaskAfterRun(task.id, result.text ?? 'No output', nextRun)

      await send(task.chat_id, `✅ Scheduled task completed:\n${result.text ?? 'No output'}`)
    } catch (err) {
      const msg = (err as Error).message
      updateTaskAfterRun(task.id, `Error: ${msg}`, task.schedule)
      await send(task.chat_id, `❌ Task failed: ${msg}`)
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
