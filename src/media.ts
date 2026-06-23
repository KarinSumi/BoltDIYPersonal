import { createWriteStream, unlinkSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { get } from 'https'
import { TELEGRAM_BOT_TOKEN, UPLOADS_DIR } from './config.js'
import { logger } from './logger.js'

export const UPLOADS_PATH = UPLOADS_DIR

export async function downloadMedia(botToken: string, fileId: string, originalFilename?: string): Promise<string> {
  const fileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  const fileData = await fileResp.json() as { ok: boolean; result?: { file_path: string } }
  if (!fileData.ok || !fileData.result?.file_path) throw new Error('Failed to get file path')

  const filePath = fileData.result.file_path
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`

  const sanitized = (originalFilename || filePath.split('/').pop() || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '-')

  const localPath = join(UPLOADS_DIR, `${Date.now()}_${sanitized}`)

  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true })

  return new Promise((resolve, reject) => {
    const file = createWriteStream(localPath)
    get(url, (response) => {
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(localPath)
      })
    }).on('error', (err) => {
      unlinkSync(localPath)
      reject(err)
    })
  })
}

export function buildPhotoMessage(localPath: string, caption?: string): string {
  return `[Image attached: ${localPath}]${caption ? `\nCaption: ${caption}` : ''}`
}

export function buildDocumentMessage(localPath: string, filename: string, caption?: string): string {
  return `[Document attached: ${filename} (${localPath})]${caption ? `\nCaption: ${caption}` : ''}`
}

export function buildVideoMessage(localPath: string, caption?: string): string {
  return `[Video attached: ${localPath}]${caption ? `\nCaption: ${caption}` : ''}`
}

export function cleanupOldUploads(maxAgeMs = 86400000): void {
  if (!existsSync(UPLOADS_DIR)) return
  const now = Date.now()
  for (const file of readdirSync(UPLOADS_DIR)) {
    const fullPath = join(UPLOADS_DIR, file)
    try {
      const stats = statSync(fullPath)
      if (now - stats.mtimeMs > maxAgeMs) {
        unlinkSync(fullPath)
        logger.info({ file }, 'Cleaned up old upload')
      }
    } catch { /* ignore */ }
  }
}
