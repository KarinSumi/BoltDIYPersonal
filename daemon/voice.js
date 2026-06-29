import crypto from 'crypto'

export const VOICE_PRESETS = [
  { id: 'gemini-female-1', name: 'Aria', gender: 'female', description: 'Warm and professional' },
  { id: 'gemini-female-2', name: 'Luna', gender: 'female', description: 'Soft and thoughtful' },
  { id: 'gemini-female-3', name: 'Nova', gender: 'female', description: 'Energetic and bright' },
  { id: 'gemini-female-4', name: 'Iris', gender: 'female', description: 'Calm and measured' },
  { id: 'gemini-female-5', name: 'Vera', gender: 'female', description: 'Authoritative' },
  { id: 'gemini-female-6', name: 'Skye', gender: 'female', description: 'Friendly and casual' },
  { id: 'gemini-female-7', name: 'Rhea', gender: 'female', description: 'Sophisticated' },
  { id: 'gemini-female-8', name: 'Thea', gender: 'female', description: 'Playful' },
  { id: 'gemini-male-1', name: 'Orion', gender: 'male', description: 'Deep and resonant' },
  { id: 'gemini-male-2', name: 'Atlas', gender: 'male', description: 'Confident' },
  { id: 'gemini-male-3', name: 'Leo', gender: 'male', description: 'Friendly' },
  { id: 'gemini-male-4', name: 'Finn', gender: 'male', description: 'Youthful and energetic' },
  { id: 'gemini-male-5', name: 'Jude', gender: 'male', description: 'Warm and reassuring' },
  { id: 'gemini-male-6', name: 'Reed', gender: 'male', description: 'Thoughtful' },
  { id: 'gemini-male-7', name: 'Ash', gender: 'male', description: 'Gravelly and authoritative' },
  { id: 'gemini-male-8', name: 'Sage', gender: 'male', description: 'Calm and wise' },
]

export class VoiceManager {
  constructor(options = {}) {
    this.broadcast = options.broadcast
    this.apiKey = process.env.GOOGLE_API_KEY || ''
    this.activeCalls = new Map()
  }

  getVoice(id) {
    return VOICE_PRESETS.find(v => v.id === id) || VOICE_PRESETS[0]
  }

  async synthesize(text, voiceId = 'gemini-female-1') {
    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY not set')
    }

    const voice = this.getVoice(voiceId)
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: voiceId.replace('gemini-', ''),
            ssmlGender: voice.gender === 'female' ? 'FEMALE' : 'MALE',
          },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`TTS error: ${response.status}`)
    }

    const data = await response.json()
    return Buffer.from(data.audioContent, 'base64')
  }

  async handleAudioChunk(ws, chunk, options = {}) {
    const transcription = '[audio transcription pending]'

    this.broadcast('audio_transcribed', {
      text: transcription,
      agentId: options.agentId,
      ts: Date.now(),
    })

    return transcription
  }

  async startCall(agentId, options = {}) {
    const callId = crypto.randomUUID()
    const call = {
      id: callId,
      agentId,
      status: 'connecting',
      startedAt: Date.now(),
      stream: null,
    }

    this.activeCalls.set(callId, call)

    this.broadcast('call_started', {
      id: callId,
      agentId,
    })

    call.status = 'active'
    return call
  }

  endCall(callId) {
    const call = this.activeCalls.get(callId)
    if (call) {
      call.status = 'ended'
      call.endedAt = Date.now()
      this.broadcast('call_ended', { id: callId, agentId: call.agentId })
      this.activeCalls.delete(callId)
    }
  }

  listCalls() {
    return Array.from(this.activeCalls.values())
  }
}
