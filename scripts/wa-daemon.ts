import { logger } from '../src/logger.js'

logger.info('WhatsApp daemon starting...')
logger.info('WhatsApp bridge requires whatsapp-web.js and a QR code scan.')
logger.info('Install: npm install whatsapp-web.js qrcode-terminal')
logger.info('Then run: npx tsx scripts/wa-daemon.ts')

process.on('SIGINT', () => { logger.info('Daemon shutting down'); process.exit(0) })
process.on('SIGTERM', () => { logger.info('Daemon shutting down'); process.exit(0) })
