import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Map of old env var names to new env var names
 */
export const ENV_CROSSWALK = {
  // Telegram
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  ALLOWED_CHAT_ID: 'ALLOWED_CHAT_ID',

  // API keys
  OPENCODE_API_KEY: 'OPENCODE_API_KEY',
  OPENCODE_API_BASE_URL: 'OPENCODE_API_BASE_URL',
  GOOGLE_API_KEY: 'GOOGLE_API_KEY',
  GROQ_API_KEY: 'GROQ_API_KEY',
  ELEVENLABS_API_KEY: 'ELEVENLABS_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  DEEPSEEK_API_KEY: 'DEEPSEEK_API_KEY',

  // Provider keys (new format — keep as-is)
  NVIDIA_API_KEY: 'NVIDIA_API_KEY',
  TOGETHER_API_KEY: 'TOGETHER_API_KEY',
  MISTRAL_API_KEY: 'MISTRAL_API_KEY',
  XAI_API_KEY: 'XAI_API_KEY',
  CEREBRAS_API_KEY: 'CEREBRAS_API_KEY',
  FIREWORKS_API_KEY: 'FIREWORKS_API_KEY',

  // Old -> new map where names differ
  DASHBOARD_TOKEN: 'OVERLAY_AUTH',
}

/**
 * The reverse map (new -> old)
 */
export const REVERSE_CROSSWALK = Object.fromEntries(
  Object.entries(ENV_CROSSWALK).map(([old, nw]) => [nw, old])
)

/**
 * Load .env file and normalize all variable names
 * (old names and new names both work)
 * @param {string} [envPath] - Path to .env file
 * @returns {Record<string, string>} Normalized env vars (all keys in new format)
 */
export function loadEnv(envPath) {
  const resolvedPath = envPath || resolve(process.cwd(), '.env')
  const envVars = { ...process.env }

  // Load from .env file if it exists
  if (existsSync(resolvedPath)) {
    const content = readFileSync(resolvedPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()

      // Strip quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '')

      // Store under both old and new names
      const newKey = ENV_CROSSWALK[key] || key
      envVars[newKey] = cleanValue
      envVars[key] = cleanValue
    }
  }

  // Crosswalk: ensure old-name vars also populate new-name vars
  for (const [oldName, newName] of Object.entries(ENV_CROSSWALK)) {
    if (oldName !== newName) {
      // If new name not set but old name is, copy over
      if (!envVars[newName] && envVars[oldName]) {
        envVars[newName] = envVars[oldName]
      }
      // If old name not set but new name is, copy back
      if (!envVars[oldName] && envVars[newName]) {
        envVars[oldName] = envVars[newName]
      }
    }
  }

  return envVars
}

/**
 * Get an env var, checking both old and new names
 * @param {string} key - The preferred key name (new format)
 * @param {Record<string, string>} [env] - Custom env object (defaults to process.env)
 * @returns {string|undefined}
 */
export function getEnv(key, env) {
  const source = env || process.env
  const oldKey = REVERSE_CROSSWALK[key] || key

  // Check new name first, then old name
  return source[key] || source[oldKey] || undefined
}

export default { ENV_CROSSWALK, REVERSE_CROSSWALK, loadEnv, getEnv }
