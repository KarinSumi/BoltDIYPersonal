import { v4 as uuid } from 'uuid'
import { parseExpression } from 'cron-parser'
import { insertScheduledTask, listScheduledTasks, deleteTask, pauseTask, resumeTask } from './db.js'
import { initDatabase } from './db.js'

initDatabase()

export function computeNextRun(cronExpression: string): string {
  try {
    const interval = parseExpression(cronExpression)
    return interval.next().toISOString()
  } catch {
    return new Date(Date.now() + 86400000).toISOString()
  }
}

const [cmd, ...args] = process.argv.slice(2)

async function main(): Promise<void> {
  switch (cmd) {
    case 'create': {
      const prompt = args[0]
      const schedule = args[1]
      const chatId = args[2]

      if (!prompt || !schedule || !chatId) {
        console.error('Usage: schedule-cli create "<prompt>" "<cron>" <chat_id>')
        process.exit(1)
      }

      const nextRun = computeNextRun(schedule)
      insertScheduledTask({
        id: uuid(),
        agent_id: 'main',
        chat_id: chatId,
        prompt,
        schedule,
        next_run: nextRun,
      })

      console.log(`Task created. Next run: ${nextRun}`)
      break
    }

    case 'list': {
      const tasks = listScheduledTasks() as Array<{ id: string; prompt: string; schedule: string; status: string; next_run: string }>
      console.log('ID\t\tPrompt\t\tSchedule\t\tStatus\t\tNext Run')
      for (const t of tasks) {
        console.log(`${t.id.slice(0, 8)}\t${t.prompt.slice(0, 30)}\t${t.schedule}\t${t.status}\t${t.next_run}`)
      }
      break
    }

    case 'delete': {
      const id = args[0]
      if (!id) { console.error('Usage: schedule-cli delete <id>'); process.exit(1) }
      deleteTask(id)
      console.log('Task deleted')
      break
    }

    case 'pause': {
      const id = args[0]
      if (!id) { console.error('Usage: schedule-cli pause <id>'); process.exit(1) }
      pauseTask(id)
      console.log('Task paused')
      break
    }

    case 'resume': {
      const id = args[0]
      if (!id) { console.error('Usage: schedule-cli resume <id>'); process.exit(1) }
      const nextRun = computeNextRun('0 0 * * *')
      resumeTask(id, nextRun)
      console.log('Task resumed')
      break
    }

    default:
      console.log('Usage: schedule-cli <create|list|delete|pause|resume> [...]')
  }
}

main().catch(console.error)
