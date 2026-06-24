import { readEnvFile } from './env.js'

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /xox[bp]-[a-zA-Z0-9-]+/g,
  /gh[po]_[a-zA-Z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /[0-9]{8,10}:[a-zA-Z0-9_-]{35}/g,
  /sk-[a-zA-Z0-9]{32,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
  /key-[a-zA-Z0-9]{32}/g,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
]

const secretIndicators = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'API']

const envCache: Array<{ key: string; value: string; b64: string; urlEnc: string }> = []
const envRaw = readEnvFile()
for (const [key, value] of Object.entries(envRaw)) {
  if (!secretIndicators.some(ind => key.toUpperCase().includes(ind))) continue
  if (value.length < 8) continue
  envCache.push({
    key,
    value,
    b64: Buffer.from(value).toString('base64'),
    urlEnc: encodeURIComponent(value),
  })
}

export function scanForSecrets(text: string): { clean: string; leaked: string[] } {
  let clean = text
  const leaked: string[] = []

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    const matches = clean.match(pattern)
    if (matches) {
      for (const match of matches) {
        clean = clean.replace(match, '[REDACTED]')
        leaked.push(match.slice(0, 20) + '...')
      }
    }
  }

  for (const entry of envCache) {
    if (clean.includes(entry.value)) {
      clean = clean.replace(new RegExp(entry.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`env:${entry.key}`)
    }
    if (clean.includes(entry.b64)) {
      clean = clean.replace(new RegExp(entry.b64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`base64:${entry.key}`)
    }
    if (clean.includes(entry.urlEnc)) {
      clean = clean.replace(new RegExp(entry.urlEnc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`url-encoded:${entry.key}`)
    }
  }

  return { clean, leaked }
}
