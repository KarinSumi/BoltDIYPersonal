import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ENV_CROSSWALK, REVERSE_CROSSWALK, loadEnv, getEnv } from './env-crosswalk.js'

describe('ENV_CROSSWALK', () => {
  it('maps known old names to new', () => {
    expect(ENV_CROSSWALK.TELEGRAM_BOT_TOKEN).toBe('TELEGRAM_BOT_TOKEN')
    expect(ENV_CROSSWALK.DASHBOARD_TOKEN).toBe('OVERLAY_AUTH')
  })
})

describe('REVERSE_CROSSWALK', () => {
  it('maps OVERLAY_AUTH back to DASHBOARD_TOKEN', () => {
    expect(REVERSE_CROSSWALK.OVERLAY_AUTH).toBe('DASHBOARD_TOKEN')
  })
})

describe('loadEnv', () => {
  it('reads from .env and normalizes', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'env-test-'))
    try {
      const envPath = join(tmpDir, '.env')
      writeFileSync(envPath, [
        'DASHBOARD_TOKEN=my-secret-token',
        'OPENAI_API_KEY=sk-old-key',
      ].join('\n'), 'utf-8')

      const env = loadEnv(envPath)
      expect(env.OVERLAY_AUTH).toBe('my-secret-token')
      expect(env.DASHBOARD_TOKEN).toBe('my-secret-token')
      expect(env.OPENAI_API_KEY).toBe('sk-old-key')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('handles missing .env gracefully', () => {
    const env = loadEnv('/nonexistent/path/.env')
    expect(typeof env).toBe('object')
  })

  it('strips quotes from values', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'env-test-'))
    try {
      const envPath = join(tmpDir, '.env')
      writeFileSync(envPath, 'DASHBOARD_TOKEN="quoted-token"\n', 'utf-8')
      const env = loadEnv(envPath)
      expect(env.OVERLAY_AUTH).toBe('quoted-token')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('getEnv', () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'bot123',
    ALLOWED_CHAT_ID: 'chat456',
  }

  it('checks both old and new names', () => {
    expect(getEnv('TELEGRAM_BOT_TOKEN', env)).toBe('bot123')
    expect(getEnv('ALLOWED_CHAT_ID', env)).toBe('chat456')
  })

  it('returns undefined for unknown key', () => {
    expect(getEnv('NONEXISTENT_VAR', env)).toBeUndefined()
  })
})
