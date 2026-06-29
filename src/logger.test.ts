import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('logger', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('exports a logger with info/warn/error/debug methods', async () => {
    const { logger } = await import('./logger.js')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('respects LOG_LEVEL env var', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    const { logger } = await import('./logger.js')
    expect(logger.level).toBe('debug')
  })

  it('defaults to info level when LOG_LEVEL unset', async () => {
    delete process.env.LOG_LEVEL
    const { logger } = await import('./logger.js')
    expect(logger.level).toBe('info')
  })
})
