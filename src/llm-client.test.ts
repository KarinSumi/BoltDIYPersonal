import { describe, it, expect, beforeEach } from 'vitest'
import { getClient, getModel, getClientStatus, resetClient } from './llm-client.js'

describe('llm-client', () => {
  beforeEach(() => {
    resetClient()
  })

  it('resetClient clears the singleton', () => {
    getClient()
    expect(getClientStatus()).toBe(true)
    resetClient()
    expect(getClientStatus()).toBe(false)
  })

  it('getClient creates fresh instance after reset', () => {
    expect(getClientStatus()).toBe(false)
    const c1 = getClient()
    expect(c1).toBeDefined()
    expect(getClientStatus()).toBe(true)
  })

  it('getModel returns a non-empty string', () => {
    expect(getModel().length).toBeGreaterThan(0)
  })
})
