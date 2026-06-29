import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkGate, tripGate, isGateTripped, getRetryAfterMs, resetGate } from './rate-limit-gate.js'

beforeEach(() => {
  resetGate()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resetGate()
})

describe('checkGate', () => {
  it('returns { blocked: false, waitMs: 0 } for an un-tripped model', () => {
    const result = checkGate('claude-3-opus')
    expect(result).toEqual({ blocked: false, waitMs: 0 })
  })

  it('returns blocked=true with correct waitMs after tripGate', () => {
    tripGate('claude-3-opus', 10_000)
    const result = checkGate('claude-3-opus')
    expect(result.blocked).toBe(true)
    expect(result.waitMs).toBeGreaterThan(0)
    expect(result.waitMs).toBeLessThanOrEqual(10_000)
  })

  it('returns unblocked after cooldown expires', () => {
    tripGate('claude-3-opus', 10_000)
    vi.advanceTimersByTime(10_001)
    const result = checkGate('claude-3-opus')
    expect(result).toEqual({ blocked: false, waitMs: 0 })
  })

  it('is independent per model', () => {
    tripGate('model-a', 10_000)
    expect(checkGate('model-a').blocked).toBe(true)
    expect(checkGate('model-b').blocked).toBe(false)
  })
})

describe('isGateTripped', () => {
  it('returns true after tripGate', () => {
    tripGate('gpt-4', 5000)
    expect(isGateTripped('gpt-4')).toBe(true)
  })

  it('returns false for un-tripped model', () => {
    expect(isGateTripped('never-tripped')).toBe(false)
  })

  it('returns false after resetGate', () => {
    tripGate('gpt-4', 5000)
    resetGate('gpt-4')
    expect(isGateTripped('gpt-4')).toBe(false)
  })
})

describe('getRetryAfterMs', () => {
  it('returns 0 for un-tripped model', () => {
    expect(getRetryAfterMs('unknown')).toBe(0)
  })

  it('returns the retryAfterMs passed to tripGate', () => {
    tripGate('claude-3-sonnet', 15_000)
    expect(getRetryAfterMs('claude-3-sonnet')).toBe(15_000)
  })
})

describe('resetGate', () => {
  it('resets a single model when given a name', () => {
    tripGate('model-a', 5000)
    tripGate('model-b', 5000)
    resetGate('model-a')
    expect(isGateTripped('model-a')).toBe(false)
    expect(isGateTripped('model-b')).toBe(true)
  })

  it('resets all models when called without args', () => {
    tripGate('model-a', 5000)
    tripGate('model-b', 5000)
    resetGate()
    expect(isGateTripped('model-a')).toBe(false)
    expect(isGateTripped('model-b')).toBe(false)
  })
})
