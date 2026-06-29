import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  GROQ_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  ELEVENLABS_VOICE_ID: '',
}))

vi.mock('./config.js', () => mockConfig)

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('voice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.GROQ_API_KEY = ''
    mockConfig.ELEVENLABS_API_KEY = ''
    mockConfig.ELEVENLABS_VOICE_ID = ''
  })

  describe('voiceCapabilities', () => {
    it('returns false for stt and tts when no keys configured', async () => {
      const { voiceCapabilities } = await import('./voice.js')
      const caps = voiceCapabilities()
      expect(caps.stt).toBe(false)
      expect(caps.tts).toBe(false)
    })

    it('returns true for tts when ElevenLabs key is configured', async () => {
      mockConfig.ELEVENLABS_API_KEY = 'test-key'
      const { voiceCapabilities } = await import('./voice.js')
      const caps = voiceCapabilities()
      expect(caps.tts).toBe(true)
    })

    it('returns true for stt when Groq key is configured', async () => {
      mockConfig.GROQ_API_KEY = 'test-key'
      const { voiceCapabilities } = await import('./voice.js')
      const caps = voiceCapabilities()
      expect(caps.stt).toBe(true)
    })
  })

  describe('transcribeAudio', () => {
    it('throws when no STT provider available', async () => {
      const { transcribeAudio } = await import('./voice.js')
      await expect(transcribeAudio(Buffer.from('test'))).rejects.toThrow('No STT provider available')
    })
  })

  describe('generateSpeech', () => {
    it('throws when no TTS provider available', async () => {
      const { generateSpeech } = await import('./voice.js')
      await expect(generateSpeech('hello')).rejects.toThrow('No TTS provider available')
    })
  })
})
