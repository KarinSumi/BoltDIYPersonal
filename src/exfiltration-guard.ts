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

function toBase64(str: string): string {
  return Buffer.from(str).toString('base64')
}

function toUrlEncoded(str: string): string {
  return encodeURIComponent(str)
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

  const env = readEnvFile()
  for (const [key, value] of Object.entries(env)) {
    const secretIndicators = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'API']
    if (!secretIndicators.some(ind => key.toUpperCase().includes(ind))) continue
    if (value.length < 8) continue

    if (clean.includes(value)) {
      clean = clean.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`env:${key}`)
    }

    const b64 = toBase64(value)
    if (clean.includes(b64)) {
      clean = clean.replace(new RegExp(b64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`base64:${key}`)
    }

    const urlEnc = toUrlEncoded(value)
    if (clean.includes(urlEnc)) {
      clean = clean.replace(new RegExp(urlEnc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
      leaked.push(`url-encoded:${key}`)
    }
  }

  return { clean, leaked }
}
