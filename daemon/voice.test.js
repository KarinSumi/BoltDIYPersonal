import { describe, it, expect, beforeEach } from 'vitest'
import { VoiceManager, VOICE_PRESETS } from './voice.js'

describe('VoiceManager', () => {
  let voice

  beforeEach(() => {
    voice = new VoiceManager({ broadcast: () => {} })
  })

  it('returns all 16 voice presets', () => {
    expect(VOICE_PRESETS.length).toBe(16)
  })

  it('has 8 female and 8 male voices', () => {
    const female = VOICE_PRESETS.filter(v => v.gender === 'female')
    const male = VOICE_PRESETS.filter(v => v.gender === 'male')
    expect(female.length).toBe(8)
    expect(male.length).toBe(8)
  })

  it('finds voice by id', () => {
    const v = voice.getVoice('gemini-female-1')
    expect(v.name).toBe('Aria')
  })

  it('returns default for unknown voice', () => {
    const v = voice.getVoice('unknown')
    expect(v.id).toBe('gemini-female-1')
  })

  it('starts and ends a call', async () => {
    const call = await voice.startCall('agent-1')
    expect(call.status).toBe('active')

    voice.endCall(call.id)
    expect(voice.listCalls().length).toBe(0)
  })

  it('lists active calls', async () => {
    await voice.startCall('agent-1')
    await voice.startCall('agent-2')
    expect(voice.listCalls().length).toBe(2)
  })

  it('each voice preset has required fields', () => {
    for (const v of VOICE_PRESETS) {
      expect(v.id).toBeDefined()
      expect(v.name).toBeDefined()
      expect(v.gender).toMatch(/^(male|female)$/)
      expect(v.description).toBeDefined()
    }
  })
})
