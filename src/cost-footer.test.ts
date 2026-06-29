import { describe, it, expect } from 'vitest'
import { formatCostFooter } from './cost-footer.js'

describe('cost-footer', () => {
  it('formatCostFooter returns empty string for off mode', () => {
    expect(formatCostFooter('gpt-4', 100, 50, 'off')).toBe('')
  })

  it('formatCostFooter returns compact mode by default', () => {
    const result = formatCostFooter('gpt-4', 100, 50)
    expect(result).toMatch(/^\[.*\]$/)
  })

  it('formatCostFooter returns compact mode with model short name', () => {
    const result = formatCostFooter('gpt-4-20240101', 100, 50, 'compact')
    expect(result).toBe('[gpt-4]')
  })

  it('formatCostFooter returns verbose mode with token counts', () => {
    const result = formatCostFooter('gpt-4', 1500, 500, 'verbose')
    expect(result).toContain('1.5k')
    expect(result).toContain('500')
  })

  it('formatCostFooter returns full mode with tokens and cost', () => {
    const result = formatCostFooter('gpt-4', 1000, 500, 'full')
    expect(result).toContain('1.0k')
    expect(result).toContain('500')
    expect(result).toContain('$')
  })

  it('formatCostFooter formats large token counts', () => {
    const result = formatCostFooter('gpt-4', 1500000, 2000000, 'full')
    expect(result).toContain('1.5M')
    expect(result).toContain('2.0M')
  })

  it('formatCostFooter shows <$0.01 for small costs', () => {
    const result = formatCostFooter('gpt-4', 1, 1, 'cost')
    expect(result).toContain('<')
  })

  it('formatCostFooter strips date suffix from model name', () => {
    const result = formatCostFooter('claude-3-opus-20240229', 100, 50, 'compact')
    expect(result).not.toContain('20240229')
  })
})
