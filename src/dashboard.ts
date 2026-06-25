import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { DASHBOARD_TOKEN, DASHBOARD_PORT } from './config.js'
import { getMemoriesByAgent, getRecentHiveEntries, getAuditEntries, listMissions, listScheduledTasks } from './db.js'
import { listAgents } from './orchestrator.js'
import { getDashboardHTML } from './dashboard-html.js'
import { logger } from './logger.js'
import { subscribeToSSE, getRecentActivity } from './events.js'
import { getAllAgentSessions, listAllBoards, listTasks, getBoard } from './kanban-db.js'

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

  app.get('/api/activity', (c) => {
    const limit = parseInt(c.req.query('limit') || '50')
    return c.json(getRecentActivity(limit))
  })

  app.get('/api/kanban/boards', (c) => {
    const status = c.req.query('status') || undefined
    return c.json(listAllBoards(status))
  })

  app.get('/api/kanban/board/:id', (c) => {
    const board = getBoard(c.req.param('id'))
    if (!board) { c.status(404); return c.json({ error: 'Board not found' }) }
    const tasks = listTasks(c.req.param('id'))
    return c.json({ board, tasks })
  })

  app.get('/api/agents/status', (c) => {
    return c.json(getAllAgentSessions())
  })

  app.get('/api/events', (c) => {
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')

    const raw = c.req.raw as unknown as import('events').EventEmitter
    let closed = false
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        const unsubscribe = subscribeToSSE((event, data) => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            } catch { /* ignore if stream closed */ }
          }
        })

        controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`))

        const keepAlive = setInterval(() => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(`:keepalive\n\n`))
            } catch {
              clearInterval(keepAlive)
            }
          }
        }, 15000)

        const cleanup = () => {
          closed = true
          unsubscribe()
          clearInterval(keepAlive)
          try { controller.close() } catch { /* ignore if already closed */ }
        }

        raw.on('close', cleanup)
        raw.on('error', cleanup)
      },
    })

    return c.body(stream)
  })

  app.get('/', (c) => {
    c.header('Content-Type', 'text/html')
    return c.body(getDashboardHTML(DASHBOARD_TOKEN))
  })

  serve({ fetch: app.fetch, port: DASHBOARD_PORT }, (info) => {
    logger.info({ port: info.port }, `Dashboard running at http://localhost:${info.port}/?token=${DASHBOARD_TOKEN}`)
  })
}
