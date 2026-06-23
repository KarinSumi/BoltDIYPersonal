import { generateEmbedding, cosineSimilarity } from './embeddings.js'
import {
  getAllEmbeddings, searchMemoriesFTS, getMemoriesByAgent, updateSalience,
  searchConversationHistory, runSalienceDecay, insertTurn, getRecentTurns
} from './db.js'
import { GOOGLE_API_KEY, MEMORY_NUDGE_INTERVAL_TURNS, MEMORY_NUDGE_INTERVAL_HOURS } from './config.js'
import { logger } from './logger.js'

let nudgesSinceLastMemory = 0

export async function buildMemoryContext(
  chatId: string,
  agentId: string,
  userMessage: string
): Promise<string> {
  const sections: string[] = []
  const surfacedIds: string[] = []

  // Layer 1: Semantic search
  try {
    const embedding = await generateEmbedding(userMessage)
    const stored = getAllEmbeddings(agentId) as Array<{ id: string; embedding: string }>
    const scored = stored
      .map(s => {
        if (!s.embedding) return { id: s.id, score: 0 }
        const vec = decodeEmbedding(s.embedding)
        return { id: s.id, score: cosineSimilarity(embedding, vec) }
      })
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    if (scored.length > 0) {
      const semantic = (getMemoriesByAgent(agentId, 50) as Array<{ id: string; summary: string }>)
        .filter(m => scored.some(s => s.id === m.id))

      if (semantic.length > 0) {
        sections.push('Related memories:\n' + semantic.map(m => `- ${m.summary}`).join('\n'))
        surfacedIds.push(...semantic.map(m => m.id))
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Semantic search skipped')
  }

  // Layer 2: FTS5 keyword search
  try {
    const keywords = userMessage.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
    if (keywords.length > 0) {
      const ftsResults = searchMemoriesFTS(keywords.join(' AND '), agentId, 5) as Array<{ id: string; summary: string }>
      if (ftsResults.length > 0) {
        sections.push('Keyword matches:\n' + ftsResults.filter(r => !surfacedIds.includes(r.id)).map(r => `- ${r.summary}`).join('\n'))
        surfacedIds.push(...ftsResults.map(r => r.id))
      }
    }
  } catch { /* fts may fail on short queries */ }

  // Layer 3: Recent high-importance memories
  try {
    const allMemories = getMemoriesByAgent(agentId, 50) as Array<{ id: string; summary: string; importance: number; created_at: string }>
    const recent = allMemories.filter(m => m.importance >= 0.7)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)

    if (recent.length > 0) {
      sections.push('Important recent memories:\n' + recent.filter(r => !surfacedIds.includes(r.id)).map(r => `- ${r.summary}`).join('\n'))
      surfacedIds.push(...recent.map(r => r.id))
    }
  } catch { /* skip */ }

  // Layer 4: Conversation history recall
  try {
    const keywords = userMessage.split(/\s+/).filter(w => w.length > 3)
    for (const kw of keywords) {
      const history = searchConversationHistory(kw, agentId, 7, 10) as Array<{ id: number; role: string; content: string }>
      if (history.length > 0) {
        const historyText = history.slice(0, 5).map(h => `${h.role}: ${h.content.slice(0, 200)}`).join('\n')
        sections.push(`Recent conversation about "${kw}":\n${historyText}`)
        break
      }
    }
  } catch { /* skip */ }

  if (sections.length === 0) return ''

  // Touch salience for surfaced memories
  for (const id of surfacedIds) {
    try { updateSalience(id, 5.0) } catch { /* skip */ }
  }

  return '[Memory Context]\n' + sections.join('\n\n')
}

export async function saveConversationTurn(
  chatId: string,
  userMsg: string,
  assistantMsg: string,
  agentId = 'main'
): Promise<void> {
  insertTurn(chatId, 'user', userMsg, agentId)
  insertTurn(chatId, 'assistant', assistantMsg, agentId)
}

export function runDecaySweep(agentId = 'main'): void {
  runSalienceDecay()
  logger.info({ agentId }, 'Memory decay sweep completed')
}

export function shouldNudgeMemory(turnsSinceLastNudge: number, hoursSinceLastNudge: number): boolean {
  return turnsSinceLastNudge >= MEMORY_NUDGE_INTERVAL_TURNS ||
    hoursSinceLastNudge >= MEMORY_NUDGE_INTERVAL_HOURS
}

function decodeEmbedding(hex: string): number[] {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  return Array.from(new Float32Array(bytes.buffer))
}
