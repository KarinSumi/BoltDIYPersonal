import { describe, it, expect } from 'vitest'

describe('classifyError', () => {
  it('classifies 429 as rate_limit', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('429 Too Many Requests')
    const result = classifyError(err)
    expect(result.category).toBe('rate_limit')
    expect(result.recovery.retryAfterMs).toBeGreaterThan(0)
    expect(result.recovery.shouldRetry).toBe(true)
  })

  it('classifies 401 as auth', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('401 Unauthorized')
    const result = classifyError(err)
    expect(result.category).toBe('auth')
    expect(result.recovery.shouldRetry).toBe(false)
  })

  it('classifies 503 as overloaded', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('503 Service Unavailable')
    const result = classifyError(err)
    expect(result.category).toBe('overloaded')
  })

  it('classifies unknown errors as unknown', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('Something weird happened')
    const result = classifyError(err)
    expect(result.category).toBe('unknown')
    expect(result.recovery.userMessage).toBe('An unexpected error occurred.')
  })

  it('classifies timeout errors', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('timeout of 30000ms exceeded')
    const result = classifyError(err)
    expect(result.category).toBe('timeout')
    expect(result.recovery.retryAfterMs).toBe(5000)
  })

  it('classifies rate_limit string', async () => {
    const { classifyError } = await import('./errors.js')
    const result = classifyError('rate_limit exceeded')
    expect(result.category).toBe('rate_limit')
  })

  it('classifies context exhausted', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('context window exceeded maximum tokens')
    const result = classifyError(err)
    expect(result.category).toBe('context_exhausted')
    expect(result.recovery.shouldNewChat).toBe(true)
    expect(result.recovery.shouldSwitchModel).toBe(true)
  })

  it('classifies network errors', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('ECONNREFUSED')
    const result = classifyError(err)
    expect(result.category).toBe('network')
  })

  it('classifies billing errors', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('billing quota exceeded')
    const result = classifyError(err)
    expect(result.category).toBe('billing')
  })

  it('classifies subprocess crash', async () => {
    const { classifyError } = await import('./errors.js')
    const err = new Error('exit code 1')
    const result = classifyError(err)
    expect(result.category).toBe('subprocess_crash')
  })
})
