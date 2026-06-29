import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'
import { MediaManager } from './media.js'

describe('MediaManager', () => {
  let uploadDir, media

  beforeEach(() => {
    const id = crypto.randomUUID()
    uploadDir = join(tmpdir(), `media-test-${id}`)
    mkdirSync(uploadDir, { recursive: true })
    media = new MediaManager({ uploadDir, maxUploadSize: 1024 * 1024 })
  })

  afterEach(() => {
    rmSync(uploadDir, { recursive: true, force: true })
  })

  it('saves uploaded files', () => {
    const result = media.save('test.png', Buffer.from('fake-png-data'))
    expect(result.filename).toBe('test.png')
    expect(result.url).toMatch(/^\/uploads\//)
    expect(result.mimeType).toBe('image/png')
    expect(existsSync(result.path)).toBe(true)
  })

  it('rejects oversized files', () => {
    expect(() => media.save('big.bin', Buffer.alloc(2 * 1024 * 1024))).toThrow(/max upload size/)
  })

  it('renders image as inline HTML', () => {
    const html = media.renderInline({ url: '/uploads/test.png', filename: 'test.png', mimeType: 'image/png' })
    expect(html).toContain('<img')
    expect(html).toContain('/uploads/test.png')
  })

  it('renders video as inline HTML', () => {
    const html = media.renderInline({ url: '/uploads/test.mp4', filename: 'test.mp4', mimeType: 'video/mp4' })
    expect(html).toContain('<video')
  })

  it('renders audio as inline HTML', () => {
    const html = media.renderInline({ url: '/uploads/test.mp3', filename: 'test.mp3', mimeType: 'audio/mpeg' })
    expect(html).toContain('<audio')
  })

  it('detects file extensions', () => {
    const result = media.save('document.pdf', Buffer.alloc(100))
    expect(result.mimeType).toBe('application/octet-stream')
  })
})
