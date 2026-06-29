import { describe, it, expect } from 'vitest'

describe('dashboard-html', () => {
  it('getDashboardHTML returns HTML string with token', async () => {
    const { getDashboardHTML } = await import('./dashboard-html.js')
    const html = getDashboardHTML('test-token')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('OpenCode OS Dashboard')
    expect(html).toContain('test-token')
  })

  it('includes Chart.js CDN', async () => {
    const { getDashboardHTML } = await import('./dashboard-html.js')
    const html = getDashboardHTML('token')
    expect(html).toContain('chart.js')
  })

  it('includes SSE connection logic', async () => {
    const { getDashboardHTML } = await import('./dashboard-html.js')
    const html = getDashboardHTML('token')
    expect(html).toContain('EventSource')
  })

  it('has kanban view', async () => {
    const { getDashboardHTML } = await import('./dashboard-html.js')
    const html = getDashboardHTML('token')
    expect(html).toContain('kanban')
  })
})
