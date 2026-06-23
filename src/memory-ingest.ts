import { v4 as uuid } from 'uuid'
import { GOOGLE_API_KEY, TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID } from './config.js'
import { generateEmbedding, cosineSimilarity, encodeEmbedding } from './embeddings.js'
import { insertMemory, getAllEmbeddings } from './db.js'
import { logger } from './logger.js'

export interface ExtractionResult {
  memories: Array<{ summary: string; entities: string[]; topics: string[]; importance: number }>
}

const EXTRACTION_PROMPT = `Analyze this conversation and extract facts worth remembering long-term.
Return a JSON object with a "memories" array. Each memory has:
- summary: a concise fact (1 sentence)
- entities: array of people, places, or things mentioned
- topics: array of topic categories
- importance: number 0-1 (how important is this to remember)

Only extract things that are meaningful preferences, decisions, project context, or personal details.
Ignore casual greetings and small talk.`

const CONSOLIDATION_PROMPT = `Analyze these memories and find patterns, themes, and contradictions.
Return a JSON object with:
- insights: a paragraph synthesizing what these memories reveal
- patterns: array of recurring themes
- contradictions: array of objects with old_memory_id, new_memory_id, resolution

Focus on meaningful patterns and resolved contradictions.`

export async function ingestConversation(
  chatId: string,
  agentId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n')
    if (conversation.length < 15) return

    const extraction = await callGeminiExtraction(conversation)
    if (!extraction?.memories) return

    const existingEmbeddings = getAllEmbeddings(agentId) as { id: string; embedding: string }[]

    for (const mem of extraction.memories) {
      if (mem.importance < 0.5) continue

      const embedding = await generateEmbedding(mem.summary)

      let isDuplicate = false
      for (const existing of existingEmbeddings) {
        if (!existing.embedding) continue
        const existingVec = decodeEmbedding(existing.embedding)
        const sim = cosineSimilarity(embedding, existingVec)
        if (sim > 0.85) {
          isDuplicate = true
          break
        }
      }

      if (isDuplicate) continue

      const memoryId = uuid()
      const encoded = encodeEmbedding(embedding)

      insertMemory({
        id: memoryId,
        chat_id: chatId,
        agent_id: agentId,
        summary: mem.summary,
        raw_text: conversation,
        entities: JSON.stringify(mem.entities),
        topics: JSON.stringify(mem.topics),
        importance: mem.importance,
        salience: mem.importance,
        embedding: encoded,
      })

      if (mem.importance >= 0.8) {
        await notifyHighImportance(memoryId, mem.summary)
      }

      existingEmbeddings.push({ id: memoryId, embedding: encoded })
    }

    logger.info({ agentId, memoriesExtracted: extraction.memories.length }, 'Memory ingestion complete')
  } catch (err) {
    logger.error({ err }, 'Memory ingestion failed')
  }
}

async function callGeminiExtraction(conversation: string): Promise<ExtractionResult | null> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${EXTRACTION_PROMPT}\n\nConversation:\n${conversation}` }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  })

  if (!resp.ok) {
    logger.error({ status: resp.status }, 'Gemini extraction API error')
    return null
  }

  const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null

  try {
    return JSON.parse(text) as ExtractionResult
  } catch {
    logger.error({ text }, 'Failed to parse extraction result')
    return null
  }
}

async function notifyHighImportance(memoryId: string, summary: string): Promise<void> {
  try {
    const chatId = ALLOWED_CHAT_ID.split(',')[0]
    if (!chatId || !TELEGRAM_BOT_TOKEN) return

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🧠 *High Importance Memory*: ${summary}\n\nUse \`/pin ${memoryId}\` to preserve it forever.`,
        parse_mode: 'Markdown'
      })
    })
  } catch { /* fire and forget */ }
}

function decodeEmbedding(hex: string): number[] {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  return Array.from(new Float32Array(bytes.buffer))
}
