import { v4 as uuid } from 'uuid'
import { logger } from './logger.js'
import { insertMission } from './db.js'

interface WhatsAppMessage {
  id: string
  from: string
  body: string
  timestamp: number
}

type MessageHandler = (msg: WhatsAppMessage) => void

let messageHandler: MessageHandler | null = null

export function setMessageHandler(handler: MessageHandler): void {
  messageHandler = handler
}

export async function sendMessage(to: string, text: string): Promise<boolean> {
  insertMission({
    id: uuid(),
    title: `WhatsApp to ${to}`,
    prompt: `Send a WhatsApp message to ${to}: ${text}`,
    assigned_agent: 'comms',
    priority: 3,
  })
  logger.info({ to }, 'WhatsApp message queued')
  return true
}

export function handleIncoming(from: string, body: string): void {
  const msg: WhatsAppMessage = {
    id: uuid(),
    from,
    body,
    timestamp: Date.now(),
  }

  if (messageHandler) {
    messageHandler(msg)
  }

  logger.info({ from, body: body.slice(0, 100) }, 'WhatsApp message received')
}

export function formatWhatsAppMessage(msg: WhatsAppMessage): string {
  return `[WhatsApp from ${msg.from}]\n${msg.body}`
}
