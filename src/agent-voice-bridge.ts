#!/usr/bin/env node
import { parseArgs } from 'util'
import { initDatabase } from './db.js'
import { PROJECT_ROOT } from './config.js'
import { logger } from './logger.js'

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: 'string' },
      message: { type: 'string' },
      'chat-id': { type: 'string', default: 'warroom' },
      quick: { type: 'boolean', default: false },
    }
  })

  const agentId = args.values.agent || 'main'
  const message = args.values.message
  const chatId = args.values['chat-id']
  const quick = args.values.quick

  if (!message) {
    console.log(JSON.stringify({ response: null, usage: null, error: 'No message provided' }))
    process.exit(0)
  }

  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(agentId)) {
    console.log(JSON.stringify({ response: null, usage: null, error: 'Invalid agent ID' }))
    process.exit(0)
  }

  try {
    initDatabase()

    const prompt = quick
      ? `War Room auto-routing: The user is in a voice meeting and this answer will be read aloud verbatim. Respond in 1-2 short sentences.\n\n${message}`
      : message

    const { queryAgent } = await import('./opencode-agent.js')
    const result = await queryAgent({
      messages: [{ role: 'user', content: prompt }],
      agentId,
    })

    const output = {
      response: result.text,
      usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
      error: null,
    }

    console.log(JSON.stringify(output))
  } catch (err) {
    console.log(JSON.stringify({ response: null, usage: null, error: (err as Error).message }))
  }
}

main()
