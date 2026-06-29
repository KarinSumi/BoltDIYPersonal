import { AgentMessage } from './opencode-agent.js'

/**
 * A rough estimate of token count (characters / 4).
 * This is fast and conservative.
 */
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Compresses the context window to prevent token explosion.
 * Implements a 75% threshold and 20% retention policy:
 * 1. Calculates a 75% threshold of the maxTokens limit.
 * 2. If currentTokens > threshold, it triggers compression.
 * 3. Keeps the most recent 20% of messages uncompressed.
 * 4. Compresses older large messages until tokens are <= threshold.
 */
export function compressContext(messages: AgentMessage[], maxTokens = 4000): AgentMessage[] {
  let currentTokens = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0)
  
  const thresholdTokens = maxTokens * 0.75

  if (currentTokens <= thresholdTokens) {
    return messages
  }

  const result = [...messages]
  
  // Protect the most recent 20% of messages from being aggressively pruned
  const preserveCount = Math.max(1, Math.ceil(messages.length * 0.20))
  const protectionIndex = Math.max(0, result.length - preserveCount)

  for (let i = 0; i < protectionIndex; i++) {
    const msg = result[i]
    if (!msg.content) continue

    const msgTokens = estimateTokens(msg.content)
    
    // Aggressively prune very large old messages
    if (msgTokens > 50) {
      const content = msg.content
      
      let compressed = content
      if (content.length > 400) {
        compressed = content.slice(0, 200) + `\n\n... [${content.length - 400} characters compressed by OpenCode OS ContextCompressor] ...\n\n` + content.slice(-200)
      }
      
      result[i] = {
        ...msg,
        content: compressed
      }
      
      currentTokens -= (msgTokens - estimateTokens(compressed))
    }

    if (currentTokens <= thresholdTokens) {
      break
    }
  }

  return result
}
