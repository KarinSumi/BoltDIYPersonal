import { v4 as uuid } from 'uuid'
import { initDatabase, insertMeetSession, updateMeetSessionStatus, getActiveMeetSessions, listMeetSessions } from './db.js'

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
      out[key] = value
      if (value !== 'true') i++
    }
  }
  return out
}

function detectPlatform(url: string): 'google_meet' | 'zoom' {
  if (url.includes('meet.google.com')) return 'google_meet'
  if (url.includes('zoom.us')) return 'zoom'
  return 'google_meet'
}

async function runBriefing(meetUrl: string, attendees: string[]): Promise<string> {
  console.log(`[Briefing] Preparing pre-flight briefing for ${meetUrl}...`)
  console.log(`[Briefing] Attendees: ${attendees.join(', ') || 'unknown'}`)

  const briefId = uuid()
  const briefPath = `outputs/meet_briefs/${briefId}_brief.md`

  const briefContent = `# Meeting Briefing\n\n**URL:** ${meetUrl}\n**Attendees:** ${attendees.join(', ') || 'Unknown'}\n\n## Context\n\nPre-flight briefing generated. Meeting bot ready.`

  const { writeFileSync, mkdirSync, existsSync } = await import('fs')
  const { dirname } = await import('path')
  const dir = dirname(briefPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(briefPath, briefContent, 'utf-8')

  console.log(`[Briefing] Saved to ${briefPath}`)
  return briefPath
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'join': {
      const parsed = parseArgs(args)
      const meetUrl = parsed['meet-url'] || parsed['url']
      const botName = parsed['bot-name'] || 'OpenCode Bot'
      const agentId = parsed['agent'] || 'main'
      const provider = parsed['provider'] || 'pika'
      const autoBrief = parsed['auto-brief'] !== 'false'

      if (!meetUrl) {
        console.error('Usage: meet-cli join --meet-url <url> [--agent main] [--provider pika]')
        process.exit(1)
      }

      const platform = detectPlatform(meetUrl)
      const sessionId = uuid()

      if (autoBrief) {
        const briefPath = await runBriefing(meetUrl, [])
        insertMeetSession({ id: sessionId, agent_id: agentId, meet_url: meetUrl, bot_name: botName, platform, provider })
        updateMeetSessionStatus(sessionId, 'active')
        console.log(`\nSession ${sessionId} joined (${platform}, ${provider})`)
        console.log(`Briefing: ${briefPath}`)
      } else {
        insertMeetSession({ id: sessionId, agent_id: agentId, meet_url: meetUrl, bot_name: botName, platform, provider })
        updateMeetSessionStatus(sessionId, 'active')
        console.log(`\nSession ${sessionId} joined (${platform}, ${provider})`)
      }
      break
    }

    case 'leave': {
      const parsed = parseArgs(args)
      const sessionId = parsed['session-id'] || args[0]
      if (!sessionId) {
        console.error('Usage: meet-cli leave --session-id <id>')
        process.exit(1)
      }
      updateMeetSessionStatus(sessionId, 'ended')
      console.log(`Session ${sessionId} ended`)
      break
    }

    case 'list': {
      const sessions = listMeetSessions() as Array<{ id: string; meet_url: string; platform: string; status: string; provider: string; created_at: string }>
      console.log('ID\t\tURL\t\tPlatform\tStatus\t\tProvider\tCreated')
      for (const s of sessions) {
        console.log(`${s.id.slice(0, 8)}\t${s.meet_url.slice(0, 30)}\t${s.platform}\t${s.status}\t${s.provider}\t${s.created_at}`)
      }
      break
    }

    default:
      console.log('Usage: meet-cli <join|leave|list> [options]')
      process.exit(1)
  }
}

main().catch(console.error)
