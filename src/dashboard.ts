import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { DASHBOARD_TOKEN, DASHBOARD_PORT } from './config.js'
import { getMemoriesByAgent, getRecentHiveEntries, getAuditEntries, listMissions, listScheduledTasks } from './db.js'
import { listAgents } from './orchestrator.js'
import { chatEvents } from './state.js'
import { getDashboardHTML } from './dashboard-html.js'
import { logger } from './logger.js'

export function startDashboard(): void {
  if (!DASHBOARD_TOKEN) {
    logger.warn('DASHBOARD_TOKEN not set, dashboard disabled')
    return
  }

  const app = new Hono()

  app.use('*', async (c, next) => {
    const token = c.req.query('token')
    if (token === DASHBOARD_TOKEN || c.req.path === '/api/health') {
      await next()
    } else {
      c.status(401)
      return c.json({ error: 'Unauthorized' })
    }
  })

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', uptime: process.uptime() })
  })

  app.get('/api/memories', (c) => {
    const agentId = c.req.query('agent_id') || 'main'
    const limit = parseInt(c.req.query('limit') || '50')
    const memories = getMemoriesByAgent(agentId, limit)
    return c.json(memories)
  })

  app.get('/api/hive-mind', (c) => {
    const limit = parseInt(c.req.query('limit') || '20')
    return c.json(getRecentHiveEntries(limit))
  })

  app.get('/api/audit-log', (c) => {
    const agentId = c.req.query('agent_id') || undefined
    const limit = parseInt(c.req.query('limit') || '100')
    return c.json(getAuditEntries(agentId, limit))
  })

  app.get('/api/agents', (c) => {
    return c.json(listAgents())
  })

  app.get('/api/tasks', (c) => {
    return c.json({
      scheduled: listScheduledTasks(),
      missions: listMissions(),
    })
  })

  app.get('/api/events', (c) => {
    return c.json({ status: 'ok', message: 'SSE endpoint' })
  })

  app.get('/', (c) => {
    c.header('Content-Type', 'text/html')
    return c.body(getDashboardHTML(DASHBOARD_TOKEN))
  })

  serve({ fetch: app.fetch, port: DASHBOARD_PORT }, (info) => {
    logger.info({ port: info.port }, `Dashboard running at http://localhost:${info.port}/?token=${DASHBOARD_TOKEN}`)
  })
}
