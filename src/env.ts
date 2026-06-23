import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
export const PROJECT_ROOT = dirname(dirname(__filename))

export function readEnvFile(keys?: string[]): Record<string, string> {
  const envPath = resolve(PROJECT_ROOT, '.env')
  if (!existsSync(envPath)) return {}

  const content = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!keys || keys.includes(key)) {
      vars[key] = value
    }
  }

  return vars
}
