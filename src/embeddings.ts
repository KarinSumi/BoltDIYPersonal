import { GOOGLE_API_KEY } from './config.js'

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is required for embeddings')

  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=' + GOOGLE_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] }
    })
  })

  if (!resp.ok) throw new Error(`Embedding API error: ${resp.status} ${await resp.text()}`)

  const data = await resp.json() as { embedding?: { values?: number[] } }
  return data.embedding?.values ?? []
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export function encodeEmbedding(vec: number[]): string {
  const buf = new Float32Array(vec)
  const bytes = new Uint8Array(buf.buffer)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function decodeEmbedding(hex: string): number[] {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  return Array.from(new Float32Array(bytes.buffer))
}
