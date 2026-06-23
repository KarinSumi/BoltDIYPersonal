import { v4 as uuid } from 'uuid'
import { GOOGLE_API_KEY, CONSOLIDATION_INTERVAL_MS } from './config.js'
import { getUnconsolidatedMemories, markMemoriesConsolidated, insertConsolidation, setSupersededBy } from './db.js'
import { logger } from './logger.js'

const CONSOLIDATION_PROMPT = `Analyze these memories and find patterns, themes, and contradictions.
Return a JSON object with:
- insights: a paragraph synthesizing what these memories reveal
- patterns: array of recurring themes
- contradictions: array of objects with old_memory_id, new_memory_id, resolution

Focus on meaningful patterns. If you find contradictions, the newer memory should override the older one.`

interface ConsolidationResult {
  insights: string
  patterns: string[]
  contradictions: Array<{ old_memory_id: string; new_memory_id: string; resolution: string }>
}

export async function runConsolidation(agentId: string): Promise<void> {
  try {
    const memories = getUnconsolidatedMemories(agentId, 20) as Array<{
      id: string; summary: string; raw_text: string; created_at: string
    }>

    if (memories.length < 3) return

    const memoryText = memories.map(m => `[${m.created_at}] ${m.summary}`).join('\n')

    const result = await callGeminiConsolidation(memoryText)
    if (!result) return

    const consolidationId = uuid()

    for (const c of (result.contradictions || [])) {
      try { setSupersededBy(c.old_memory_id, c.new_memory_id) } catch { /* continue */ }
    }

    insertConsolidation({
      id: consolidationId,
      agent_id: agentId,
      insights: result.insights,
      patterns: JSON.stringify(result.patterns),
      contradictions: JSON.stringify(result.contradictions),
      memory_ids: JSON.stringify(memories.map(m => m.id)),
    })

    markMemoriesConsolidated(memories.map(m => m.id))

    logger.info({ agentId, memoryCount: memories.length }, 'Consolidation complete')
  } catch (err) {
    logger.error({ err, agentId }, 'Consolidation failed')
  }
}

async function callGeminiConsolidation(memories: string): Promise<ConsolidationResult | null> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${CONSOLIDATION_PROMPT}\n\nMemories:\n${memories}` }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  })

  if (!resp.ok) {
    logger.error({ status: resp.status }, 'Gemini consolidation API error')
    return null
  }

  const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null

  try {
    return JSON.parse(text) as ConsolidationResult
  } catch {
    logger.error({ text }, 'Failed to parse consolidation result')
    return null
  }
}

export function startConsolidationLoop(agentId: string): ReturnType<typeof setInterval> {
  runConsolidation(agentId)
  return setInterval(() => runConsolidation(agentId), CONSOLIDATION_INTERVAL_MS)
}
