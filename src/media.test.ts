import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  TELEGRAM_BOT_TOKEN: 'test-token',
  UPLOADS_DIR: '/test/uploads',
}))

vi.mock('./config.js', () => mockConfig)

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFs = vi.hoisted(() => ({
  createWriteStream: vi.fn(() => ({
    close: vi.fn(),
  })),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn<() => string[]>(() => []),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

vi.mock('https', () => ({
  get: vi.fn((_url, cb) => {
    cb({ pipe: vi.fn(), on: vi.fn((_evt, fn) => { if (_evt === 'finish') fn() }) })
    return { on: vi.fn() }
  }),
}))

describe('media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildPhotoMessage', () => {
    it('formats photo message without caption', async () => {
      const { buildPhotoMessage } = await import('./media.js')
      const result = buildPhotoMessage('/path/photo.jpg')
      expect(result).toContain('Image attached')
      expect(result).toContain('/path/photo.jpg')
    })

    it('formats photo message with caption', async () => {
      const { buildPhotoMessage } = await import('./media.js')
      const result = buildPhotoMessage('/path/photo.jpg', 'A nice photo')
      expect(result).toContain('A nice photo')
    })
  })

  describe('buildDocumentMessage', () => {
    it('formats document message', async () => {
      const { buildDocumentMessage } = await import('./media.js')
      const result = buildDocumentMessage('/path/doc.pdf', 'doc.pdf')
      expect(result).toContain('doc.pdf')
    })
  })

  describe('buildVideoMessage', () => {
    it('formats video message', async () => {
      const { buildVideoMessage } = await import('./media.js')
      const result = buildVideoMessage('/path/video.mp4')
      expect(result).toContain('Video attached')
    })
  })

  describe('cleanupOldUploads', () => {
    it('does not throw when uploads dir does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)
      const { cleanupOldUploads } = await import('./media.js')
      expect(() => cleanupOldUploads()).not.toThrow()
    })

    it('cleans up old files', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockReturnValue(['old_file.txt'])
      mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() - 90000000 })
      const { cleanupOldUploads } = await import('./media.js')
      cleanupOldUploads(86400000)
      expect(mockFs.unlinkSync).toHaveBeenCalled()
    })
  })
})
