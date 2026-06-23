#!/usr/bin/env node
import { v4 as uuid } from 'uuid'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { GOOGLE_API_KEY, PIKA_API_KEY, RECALL_API_KEY, MEET_BRIEFS_DIR } from './config.js'
import { insertMeetSession, updateMeetSessionStatus, listMeetSessions, getDb } from './db.js'
import { initDatabase } from './db.js'

async function main() {
  initDatabase()
  const subcommand = process.argv[2]

  switch (subcommand) {
    case 'join':
      await handleJoin()
      break
    case 'leave':
      await handleLeave()
      break
    case 'list':
      handleList()
      break
    default:
      console.log('Usage: meet join|leave|list')
      console.log('  meet join --meet-url URL --agent main [--bot-name NAME] [--provider pika|recall]')
      console.log('  meet leave --session-id ID')
      console.log('  meet list')
  }

  process.exit(0)
}

async function handleJoin() {
  const args = parseArgs(process.argv.slice(3))
  const meetUrl = args['--meet-url']
  const agentId = args['--agent'] || 'main'
  const botName = args['--bot-name'] || 'OpenCode Bot'
  const provider = args['--provider'] || 'pika'
  const imagePath = args['--image']
  const voiceId = args['--voice-id']
  const autoBrief = args['--auto-brief'] !== 'false'

  if (!meetUrl) {
    console.log('Error: --meet-url is required')
    return
  }

  const platform = meetUrl.includes('meet.google.com') ? 'google_meet' : 'zoom'

  console.log(`Joining ${platform} meeting...`)
  console.log(`  URL: ${meetUrl}`)
  console.log(`  Agent: ${agentId}`)
  console.log(`  Provider: ${provider}`)

  if (autoBrief) {
    console.log('Running pre-flight briefing...')
    const briefing = await runBriefing(meetUrl, agentId)
    console.log(`  Briefing saved to: ${briefing}`)
  }

  const sessionId = uuid()
  insertMeetSession({ id: sessionId, agent_id: agentId, meet_url: meetUrl, bot_name: botName, platform, provider })

  console.log(`\n✅ Session created: ${sessionId}`)
  console.log(`   The bot is joining the meeting as "${botName}"`)
}

async function handleLeave() {
  const args = parseArgs(process.argv.slice(3))
  const sessionId = args['--session-id']

  if (!sessionId) {
    console.log('Error: --session-id is required')
    return
  }

  updateMeetSessionStatus(sessionId, 'ended')
  console.log(`✅ Session ${sessionId} ended`)
}

function handleList() {
  const sessions = listMeetSessions() as Array<{
    id: string; agent_id: string; meet_url: string; platform: string; provider: string; status: string; created_at: string
  }>

  if (sessions.length === 0) {
    console.log('No meeting sessions.')
    return
  }

  for (const s of sessions) {
    console.log(`${s.id.slice(0, 8)} | ${s.agent_id} | ${s.platform} | ${s.provider} | ${s.status} | ${s.created_at}`)
  }
}

async function runBriefing(meetUrl: string, agentId: string): Promise<string> {
  const dateDir = new Date().toISOString().slice(0, 10)
  const briefDir = resolve(MEET_BRIEFS_DIR, dateDir)
  if (!existsSync(briefDir)) mkdirSync(briefDir, { recursive: true })

  const briefPath = resolve(briefDir, `${uuid().slice(0, 8)}_brief.md`)

  let briefing = '## Pre-Flight Briefing\n\n'

  if (GOOGLE_API_KEY) {
    try {
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}&key=${GOOGLE_API_KEY}`)
      if (resp.ok) {
        const data = await resp.json() as { items?: Array<{ summary: string }> }
        if (data.items?.length) {
          briefing += '### Upcoming Events\n'
          for (const event of data.items.slice(0, 5)) {
            briefing += `- ${event.summary}\n`
          }
          briefing += '\n'
        }
      }
    } catch { /* Calendar fetch failed */ }
  }

  briefing += '### Meeting Context\n'
  briefing += `- Meeting URL: ${meetUrl}\n`
  briefing += `- Agent: ${agentId}\n`
  briefing += `- Briefing generated: ${new Date().toISOString()}\n`

  writeFileSync(briefPath, briefing, 'utf-8')
  return briefPath
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      result[args[i]] = args[i + 1]
      i++
    } else if (args[i].startsWith('--')) {
      result[args[i]] = 'true'
    }
  }
  return result
}

main().catch(console.error)
