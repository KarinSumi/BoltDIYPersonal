import OpenAI from 'openai'
import { OPENCODE_API_KEY, OPENCODE_API_BASE_URL, OPENCODE_MODEL } from './config.js'

let client: OpenAI | null = null

export function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: OPENCODE_API_KEY || 'no-key',
      baseURL: OPENCODE_API_BASE_URL || undefined,
    })
  }
  return client
}

export function getModel(): string {
  return OPENCODE_MODEL
}

export function resetClient(): void {
  client = null
}

export function getClientStatus(): boolean {
  return client !== null
}
