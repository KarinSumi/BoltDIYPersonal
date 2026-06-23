import { v4 as uuid } from 'uuid'
import { insertMission, listMissions, cancelMission, completeMission } from './db.js'
import { initDatabase } from './db.js'

initDatabase()

const [cmd, ...args] = process.argv.slice(2)

interface ParsedArgs {
  [key: string]: string | undefined
}

function parseArgs(input: string[]): ParsedArgs {
  const out: ParsedArgs = {}
  for (let i = 0; i < input.length; i++) {
    if (input[i].startsWith('--')) {
      const key = input[i].slice(2)
      const value = input[i + 1] && !input[i + 1].startsWith('--') ? input[i + 1] : 'true'
      out[key] = value as string
      if (value !== 'true') i++
    }
  }
  return out
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'create': {
      const parsed = parseArgs(args)
      const title = parsed['title'] || 'Untitled'
      const prompt = parsed['prompt']
      const agent = parsed['agent']
      const priority = parseInt(parsed['priority'] || '3')

      if (!prompt) { console.error('Usage: mission-cli create --title "..." --prompt "..." [--agent ops] [--priority 3]'); process.exit(1) }

      insertMission({ id: uuid(), title, prompt, assigned_agent: agent, priority })
      console.log(`Mission "${title}" created (priority: ${priority})`)
      break
    }

    case 'list': {
      const missions = listMissions() as Array<{ id: string; title: string; status: string; priority: number; assigned_agent: string | null; created_at: string }>
      console.log('ID\t\tTitle\t\tAgent\t\tPriority\tStatus\t\tCreated')
      for (const m of missions) {
        console.log(`${m.id.slice(0, 8)}\t${m.title.slice(0, 20)}\t${m.assigned_agent || 'unassigned'}\t${m.priority}\t${m.status}\t${m.created_at}`)
      }
      break
    }

    case 'result': {
      const id = args[0]
      if (!id) { console.error('Usage: mission-cli result <id>'); process.exit(1) }
      const missions = listMissions() as Array<{ id: string; result: string | null }>
      const mission = missions.find(m => m.id === id)
      console.log(mission?.result || 'No result')
      break
    }

    case 'cancel': {
      const id = args[0]
      if (!id) { console.error('Usage: mission-cli cancel <id>'); process.exit(1) }
      cancelMission(id)
      console.log('Mission cancelled')
      break
    }

    default:
      console.log('Usage: mission-cli <create|list|result|cancel> [...]')
  }
}

main().catch(console.error)
