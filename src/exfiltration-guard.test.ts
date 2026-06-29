import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./env.js', () => ({
  readEnvFile: () => ({}),
}))

describe('exfiltration-guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('redacts known API key patterns', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const result = scanForSecrets('my key is sk-ant-test1234567890abcdef1234')
    expect(result.clean).not.toContain('sk-ant-test1234567890abcdef1234')
    expect(result.leaked.length).toBeGreaterThan(0)
  })

  it('redacts OpenAI keys', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const result = scanForSecrets('key: sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result.clean).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result.leaked.length).toBeGreaterThan(0)
  })

  it('redacts AWS access keys', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const result = scanForSecrets('AWS key: AKIAIOSFODNN7EXAMPLE')
    expect(result.clean).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(result.leaked.length).toBeGreaterThan(0)
  })

  it('redacts GitHub tokens', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const result = scanForSecrets('token: ghp_abcdefghijklmnopqrstuvwxyz1234567890')
    expect(result.clean).not.toContain('ghp_')
    expect(result.leaked.length).toBeGreaterThan(0)
  })

  it('redacts private keys', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const pem = '-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----'
    const result = scanForSecrets(pem)
    expect(result.clean).not.toContain('BEGIN PRIVATE KEY')
    expect(result.leaked.length).toBeGreaterThan(0)
  })

  it('returns clean text with no secrets unchanged', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const text = 'Hello, this is a normal message with no secrets.'
    const result = scanForSecrets(text)
    expect(result.clean).toBe(text)
    expect(result.leaked).toEqual([])
  })

  it('redacts all occurrences', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const text = 'token: sk-abcdefghijklmnopqrstuvwxyz123456, token2: sk-abcdefghijklmnopqrstuvwxyz123456'
    const result = scanForSecrets(text)
    expect(result.clean).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
  })

  it('redacts slack tokens', async () => {
    const { scanForSecrets } = await import('./exfiltration-guard.js')
    const result = scanForSecrets('slack: xoxb-FAKETOKEN-FAKETOKEN-FAKETOKEN')
    expect(result.clean).not.toContain('xoxb')
    expect(result.leaked.length).toBeGreaterThan(0)
  })
})
