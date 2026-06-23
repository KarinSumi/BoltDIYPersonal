import { readFileSync } from 'fs'
import { GROQ_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from './config.js'
import { logger } from './logger.js'

interface TTSProvider {
  name: string
  generate(text: string): Promise<Buffer>
  isAvailable(): boolean
}

interface STTProvider {
  name: string
  transcribe(audioBuffer: Buffer): Promise<string>
  isAvailable(): boolean
}

const TTS_PROVIDERS: TTSProvider[] = [
  {
    name: 'ElevenLabs',
    async generate(text: string): Promise<Buffer> {
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'}`, {
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
      })
      if (!resp.ok) throw new Error(`ElevenLabs error: ${resp.status}`)
      return Buffer.from(await resp.arrayBuffer())
    },
    isAvailable: () => !!ELEVENLABS_API_KEY,
  },
  {
    name: 'macOS say',
    async generate(text: string): Promise<Buffer> {
      const { execSync } = await import('child_process')
      execSync(`say -o /tmp/opencode-tts.aiff "${text.replace(/"/g, '\'')}"`, { timeout: 10000 })
      return readFileSync('/tmp/opencode-tts.aiff')
    },
    isAvailable: () => process.platform === 'darwin',
  },
]

const STT_PROVIDERS: STTProvider[] = [
  {
    name: 'Groq Whisper',
    async transcribe(audioBuffer: Buffer): Promise<string> {
      const blob = new Blob([audioBuffer as unknown as BlobPart], { type: 'audio/ogg' })
      const form = new FormData()
      form.append('file', blob, 'audio.ogg')
      form.append('model', 'whisper-large-v3')

      const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: form,
      })

      if (!resp.ok) throw new Error(`Groq error: ${resp.status}`)
      const data = await resp.json() as { text?: string }
      return data.text ?? ''
    },
    isAvailable: () => !!GROQ_API_KEY,
  },
]

export async function transcribeAudio(audioBuffer: Buffer): Promise<{ text: string; provider: string }> {
  for (const provider of STT_PROVIDERS) {
    if (!provider.isAvailable()) continue
    try {
      const text = await provider.transcribe(audioBuffer)
      if (text) return { text, provider: provider.name }
    } catch (err) {
      logger.warn({ err, provider: provider.name }, 'STT provider failed')
    }
  }
  throw new Error('No STT provider available')
}

export async function generateSpeech(text: string): Promise<{ buffer: Buffer; provider: string }> {
  for (const provider of TTS_PROVIDERS) {
    if (!provider.isAvailable()) continue
    try {
      const buffer = await provider.generate(text)
      return { buffer, provider: provider.name }
    } catch (err) {
      logger.warn({ err, provider: provider.name }, 'TTS provider failed')
    }
  }
  throw new Error('No TTS provider available')
}

export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  return {
    stt: STT_PROVIDERS.some(p => p.isAvailable()),
    tts: TTS_PROVIDERS.some(p => p.isAvailable()),
  }
}
