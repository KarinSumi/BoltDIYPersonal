import { initDatabase, getSession, setSession, clearSession } from './db.js'
import { queryAgent } from './opencode-agent.js'
import { logger } from './logger.js'

interface BridgeArgs {
  agent: string
  message: string
  chatId: string
  quick: boolean
}

function parseArgs(): BridgeArgs {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        parsed[key] = next
        i++
      } else {
        parsed[key] = 'true'
      }
    }
  }

  return {
    agent: parsed['agent'] || 'main',
    message: parsed['message'] || '',
    chatId: parsed['chat-id'] || 'warroom',
    quick: parsed['quick'] === 'true',
  }
}

async function main(): Promise<void> {
  const args = parseArgs()

  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(args.agent)) {
    console.log(JSON.stringify({ response: null, usage: null, error: 'Invalid agent ID' }))
    process.exit(0)
  }

  try {
    initDatabase()
  } catch (err) {
    console.log(JSON.stringify({ response: null, usage: null, error: `DB init error: ${(err as Error).message}` }))
    process.exit(0)
  }

  let prompt = args.message
  if (args.quick) {
    prompt = `War Room auto-routing: The user is in a voice meeting and this answer will be read aloud verbatim. Respond in 1-2 short sentences.\n\nUser: ${args.message}`
  }

  try {
    const sessionId = getSession(args.chatId, args.agent)
    const result = await queryAgent({
      messages: [{ role: 'user', content: prompt }],
      sessionId,
      agentId: args.agent,
    })

    console.log(JSON.stringify({
      response: result.text,
      usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
      error: null,
    }))
  } catch (err) {
    console.log(JSON.stringify({
      response: null,
      usage: null,
      error: (err as Error).message,
    }))
  }
}

main().catch((err) => {
  console.log(JSON.stringify({ response: null, usage: null, error: (err as Error).message }))
  process.exit(0)
})
