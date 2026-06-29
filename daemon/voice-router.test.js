import { describe, it, expect, vi } from 'vitest'
import { VoiceRouter } from './voice-router.js'

describe('VoiceRouter', () => {
  it('returns default voice for unknown agent', () => {
    const router = new VoiceRouter()
    const voice = router.getVoiceForAgent('unknown')
    expect(voice.id).toBe('gemini-female-1')
    expect(voice.ttsEnabled).toBe(true)
  })

  it('returns agent-specific voice from registry', () => {
    const mockRegistry = {
      get: (id) => ({ id, voiceId: 'gemini-male-3', ttsEnabled: true }),
    }
    const router = new VoiceRouter({ registry: mockRegistry })
    const voice = router.getVoiceForAgent('bob')
    expect(voice.id).toBe('gemini-male-3')
    expect(voice.name).toBe('Leo')
  })

  it('disables TTS when agent has ttsEnabled=false', () => {
    const mockRegistry = {
      get: (id) => ({ id, voiceId: 'gemini-female-2', ttsEnabled: false }),
    }
    const router = new VoiceRouter({ registry: mockRegistry })
    const voice = router.getVoiceForAgent('mute-agent')
    expect(voice.ttsEnabled).toBe(false)
  })

  it('speak returns null when TTS disabled', async () => {
    const mockRegistry = {
      get: (id) => ({ id, ttsEnabled: false }),
    }
    const router = new VoiceRouter({ registry: mockRegistry })
    const result = await router.speak('silent-agent', 'Hello')
    expect(result).toBeNull()
  })

  it('speak broadcasts agent_speech event on success', async () => {
    const broadcast = vi.fn()
    const mockVoiceManager = {
      getVoice: (id) => ({ id, name: 'Test', gender: 'female', description: 'Test' }),
      synthesize: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
    }
    const registry = { get: (id) => ({ id, voiceId: 'gemini-female-1', ttsEnabled: true }) }
    const router = new VoiceRouter({ broadcast, registry, voiceManager: mockVoiceManager })

    await router.speak('alice', 'Hello world')

    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0]
    expect(event.type).toBe('agent_speech')
    expect(event.data.agentId).toBe('alice')
    expect(event.data.text).toBe('Hello world')
  })

  it('speak broadcasts agent_speech_error on failure', async () => {
    const broadcast = vi.fn()
    const mockVoiceManager = {
      getVoice: (id) => ({ id, name: 'Test', gender: 'female', description: 'Test' }),
      synthesize: vi.fn().mockRejectedValue(new Error('API error')),
    }
    const registry = { get: (id) => ({ id, voiceId: 'gemini-female-1', ttsEnabled: true }) }
    const router = new VoiceRouter({ broadcast, registry, voiceManager: mockVoiceManager })

    await router.speak('alice', 'Test')

    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0]
    expect(event.type).toBe('agent_speech_error')
    expect(event.data.error).toBe('API error')
  })

  it('handlePushToTalk returns transcribed text when Whisper succeeds', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const broadcast = vi.fn()
    const router = new VoiceRouter({ broadcast })

    const fakeResponse = { ok: true, json: () => Promise.resolve({ text: 'Hello world' }) }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse)

    const audioBuffer = Buffer.from('fake-audio')
    const result = await router.handlePushToTalk(audioBuffer, { agentId: 'main' })

    expect(result).toBe('Hello world')
    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0]
    expect(event.type).toBe('audio_transcribed')
    expect(event.data.agentId).toBe('main')
    expect(event.data.text).toBe('Hello world')

    vi.restoreAllMocks()
  })

  it('handlePushToTalk handles Whisper failure and returns fallback text', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const broadcast = vi.fn()
    const router = new VoiceRouter({ broadcast })

    const fakeResponse = { ok: false }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse)

    const audioBuffer = Buffer.from('fake-audio')
    const result = await router.handlePushToTalk(audioBuffer, {
      agentId: 'main',
      fallbackText: 'custom fallback',
    })

    expect(result).toBe('custom fallback')
    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0]
    expect(event.type).toBe('audio_transcribed')
    expect(event.data.text).toBe('custom fallback')

    vi.restoreAllMocks()
  })

  it('handlePushToTalk handles fetch exception and returns fallback text', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const broadcast = vi.fn()
    const router = new VoiceRouter({ broadcast })

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

    const audioBuffer = Buffer.from('fake-audio')
    const result = await router.handlePushToTalk(audioBuffer, { agentId: 'main' })

    expect(result).toBe('[audio transcribed]')
    expect(broadcast).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })
})
