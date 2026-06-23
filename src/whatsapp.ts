// WhatsApp Bridge — uses whatsapp-web.js for browser automation
// Import and use in index.ts when WHATSAPP_ENABLED is set

import { logger } from './logger.js'

export interface WhatsAppConfig {
  sessionPath: string
  onIncomingMessage: (chatId: string, message: string) => Promise<void>
}

export async function initWhatsApp(config: WhatsAppConfig): Promise<void> {
  logger.info('WhatsApp bridge initialization placeholder')

  // In production, this would:
  // 1. Launch Puppeteer with whatsapp-web.js
  // 2. Scan QR code for first-time auth
  // 3. Listen for incoming messages and forward via onIncomingMessage
  // 4. Maintain a message outbox queue in SQLite

  console.log(`
WhatsApp Bridge requires whatsapp-web.js.

To enable:
  1. npm install whatsapp-web.js qrcode-terminal
  2. Set WHATSAPP_ENABLED=true in .env
  3. On first run, scan the QR code displayed in terminal
`)
}
