import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

const MEDIA_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

export class MediaManager {
  constructor(options = {}) {
    this.uploadDir = options.uploadDir || join(process.cwd(), 'workspace', 'uploads')
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }
    this.maxUploadSize = options.maxUploadSize || 50 * 1024 * 1024
  }

  save(filename, buffer) {
    if (buffer.length > this.maxUploadSize) {
      throw new Error(`File exceeds max upload size of ${this.maxUploadSize / 1024 / 1024}MB`)
    }

    const ext = this._getExtension(filename)
    const id = crypto.randomUUID()
    const storedName = `${id}${ext}`
    const path = join(this.uploadDir, storedName)

    writeFileSync(path, buffer)

    return {
      id,
      filename,
      storedName,
      path,
      url: `/uploads/${storedName}`,
      mimeType: MEDIA_TYPES[ext] || 'application/octet-stream',
      size: buffer.length,
    }
  }

  renderInline(media) {
    if (media.mimeType.startsWith('image/')) {
      return `<img src="${media.url}" alt="${media.filename}" style="max-width:100%;border-radius:8px" />`
    }
    if (media.mimeType.startsWith('video/')) {
      return `<video src="${media.url}" controls style="max-width:100%;border-radius:8px"></video>`
    }
    if (media.mimeType.startsWith('audio/')) {
      return `<audio src="${media.url}" controls></audio>`
    }
    return `<a href="${media.url}" download="${media.filename}">${media.filename}</a>`
  }

  async generateImage(prompt, options = {}) {
    const provider = options.provider || 'openai'
    const apiKey = process.env[options.apiKeyEnv || 'OPENAI_API_KEY'] || ''

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: options.size || '1024x1024',
        }),
      })

      if (!response.ok) {
        throw new Error(`Image generation error: ${response.status}`)
      }

      const data = await response.json()
      const imageUrl = data.data?.[0]?.url

      if (imageUrl) {
        const imgResponse = await fetch(imageUrl)
        const buffer = Buffer.from(await imgResponse.arrayBuffer())
        return this.save(`generated-${Date.now()}.png`, buffer)
      }
    }

    throw new Error(`Unsupported image provider: ${provider}`)
  }

  _getExtension(filename) {
    const idx = filename.lastIndexOf('.')
    return idx >= 0 ? filename.slice(idx).toLowerCase() : '.bin'
  }

  getFilePath(storedName) {
    return join(this.uploadDir, storedName)
  }
}
