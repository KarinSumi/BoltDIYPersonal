import { VoiceManager } from './voice.js'

export class VoiceRouter {
  constructor(options = {}) {
    this.voiceManager = options.voiceManager || new VoiceManager(options)
    this.registry = options.registry || null
    this.broadcast = options.broadcast || (() => {})
  }

  getVoiceForAgent(agentId) {
    let voiceId = 'gemini-female-1'
    let ttsEnabled = true

    if (this.registry) {
      const agent = this.registry.get(agentId)
      if (agent) {
        voiceId = agent.voiceId || agent.voice || 'gemini-female-1'
        ttsEnabled = agent.ttsEnabled !== false
      }
    }

    return {
      ...this.voiceManager.getVoice(voiceId),
      ttsEnabled,
    }
  }

  async speak(agentId, text) {
    const voice = this.getVoiceForAgent(agentId)
    if (!voice.ttsEnabled) return null

    try {
      const audio = await this.voiceManager.synthesize(text, voice.id)
      const event = {
        type: 'agent_speech',
        data: {
          agentId,
          voiceId: voice.id,
          text,
          audioBase64: audio.toString('base64'),
          duration: Math.ceil(text.length / 15) * 1000,
        },
      }
      this.broadcast(event)
      return event
    } catch (err) {
      this.broadcast({
        type: 'agent_speech_error',
        data: { agentId, error: err.message },
      })
      return null
    }
  }

  async handlePushToTalk(audioBuffer, options = {}) {
    const agentId = options.agentId || 'main'
    const apiKey = process.env.OPENAI_API_KEY || ''
    let text = ''

    if (apiKey) {
      try {
        const formData = new FormData()
        const blob = new Blob([audioBuffer], { type: 'audio/webm' })
        formData.append('file', blob, 'audio.webm')
        formData.append('model', 'whisper-1')

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        })

        if (response.ok) {
          const data = await response.json()
          text = data.text || ''
        }
      } catch {}
    }

    if (!text) {
      text = options.fallbackText || '[audio transcribed]'
    }

    this.broadcast({
      type: 'audio_transcribed',
      data: { agentId, text, ts: Date.now() },
    })

    return text
  }
}
