import { getClient, getModel } from './llm-client.js'
import { logger } from './logger.js'

export interface RoutingDecision {
  agentId: string
  prompt: string
  confidence: 'high' | 'medium' | 'low'
}

interface AgentEntry {
  id: string
  name: string
  capabilities: string[]
}

const ROUTER_SYSTEM_PROMPT = `You are a request router. Given a user message and a catalog of available agents, select the single best agent to handle the request.

Rules:
- Respond with ONLY valid JSON — no explanations, no markdown
- If the request is a general chat, greeting, or doesn't fit any specialist → use "main"
- Be precise — pick the most specific agent for the task
- The prompt field can optionally rewrite the user's request for the target agent

Response format:
{"agent":"agent_id","confidence":"high|medium|low","prompt":"original or rewritten message"}`

export async function classifyIntent(
  message: string,
  agents: AgentEntry[]
): Promise<RoutingDecision> {
  const fallback: RoutingDecision = { agentId: 'main', prompt: message, confidence: 'medium' }

  if (!getClient()) {
    return fallback
  }

  const client = getClient()
  const model = getModel()

  const catalogText = agents.map(a =>
    `- ${a.id}: ${a.name} — ${a.capabilities.join(', ')}`
  ).join('\n')

  const userPrompt = `Agent catalog:\n${catalogText}\n\nUser message: "${message}"\n\nRespond with JSON.`

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.1,
    })

    const raw = completion.choices[0]?.message?.content?.trim() || ''

    const jsonMatch = raw.match(/\{.*\}/s)
    if (!jsonMatch) {
      logger.warn({ raw }, 'Router: no JSON found in response')
      return fallback
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>

    const agentId = parsed.agent || 'main'
    const confidence = (parsed.confidence as RoutingDecision['confidence']) || 'medium'
    const prompt = parsed.prompt || message

    const validAgents = new Set(agents.map(a => a.id))
    if (!validAgents.has(agentId)) {
      logger.warn({ agentId }, 'Router: unknown agent')
      return { agentId: 'main', prompt: message, confidence: 'low' }
    }

    return { agentId, prompt, confidence }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Router: classification failed')
    return fallback
  }
}
