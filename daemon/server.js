import http from 'http'
import https from 'https'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { VoiceRouter } from './voice-router.js'
import { PermissionBroker } from './perm.js'
import { ProjectRegistry } from './projects.js'
import { JobScheduler } from './jobs.js'
import { createRedirectServer } from '../bridge/old-dashboard.js'
import Registry from './registry.js'
import { MemStore } from './db-adapter.js'

const rateLimitMap = new Map()
const rateLimitCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 30000
  for (const [key, val] of rateLimitMap) {
    if (val.windowStart < cutoff) rateLimitMap.delete(key)
  }
}, 60000)

export function stopRateLimitCleanup() {
  clearInterval(rateLimitCleanupInterval)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OVERLAY_HTML = readFileSync(join(__dirname, 'overlay.html'), 'utf-8')
const PLUGIN_HUB_HTML = readFileSync(join(__dirname, 'pluginshub.html'), 'utf-8')

function authMiddleware(req, res, options) {
  const token = options.overlayAuth || process.env.OVERLAY_AUTH
  if (!token) return true

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'GET' && parsedUrl.pathname === '/') return true

  const authHeader = req.headers['authorization']
  if (!authHeader) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return false
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return false
  }

  if (parts[1] !== token) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Forbidden' }))
    return false
  }

  return true
}

export function createServer(options = {}) {
  return new Promise(async (resolve, reject) => {
    const pluginManager = options.pluginManager || null
    const host = options.host || process.env.HOST || '127.0.0.1'

    const sslCertPath = options.sslCert || process.env.SSL_CERT_PATH
    const sslKeyPath = options.sslKey || process.env.SSL_KEY_PATH
    let sslOptions = null

    if (sslCertPath && sslKeyPath) {
      if (existsSync(sslCertPath) && existsSync(sslKeyPath)) {
        sslOptions = {
          cert: readFileSync(sslCertPath),
          key: readFileSync(sslKeyPath),
        }
      } else {
        console.warn('SSL cert or key file not found, falling back to HTTP')
      }
    } else if (sslCertPath || sslKeyPath) {
      console.warn('Only one of SSL_CERT_PATH/SSL_KEY_PATH is set, falling back to HTTP')
    }

    const server = sslOptions ? https.createServer(sslOptions, handler) : http.createServer(handler)

    function handler(req, res) {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const pathname = parsedUrl.pathname

      // Rate limiting for /api/chat
      if (pathname === '/api/chat') {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
        const now = Date.now()
        if (!rateLimitMap.has(ip)) {
          rateLimitMap.set(ip, { count: 0, windowStart: now })
        }
        const entry = rateLimitMap.get(ip)
        if (now - entry.windowStart > 10000) {
          entry.count = 0
          entry.windowStart = now
        }
        entry.count++
        if (entry.count > 20) {
          res.writeHead(429, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Too many requests' }))
          return
        }
      }

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (!authMiddleware(req, res, options)) return

      if (req.method === 'GET' && pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
        return
      }

      if (req.method === 'GET' && pathname === '/api/agents') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(agentRegistry.list()))
        return
      }

      if (req.method === 'GET' && pathname === '/api/agents/status') {
        const agents = agentRegistry.list()
        const statuses = agents.map(a => ({
          agent_id: a.id,
          name: a.name,
          role: a.role || '',
          status: a.status || 'online',
        }))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(statuses))
        return
      }

      if (req.method === 'POST' && pathname === '/api/chat') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const { message } = JSON.parse(body)
            if (!message) throw new Error('Message is required')

            const { ProviderRouter } = await import('./provider-router.js')
            const router = new ProviderRouter({ registry: agentRegistry })
            const config = router.getRequestConfig('main')

            let text
            if (config.apiKey) {
              const isAnthropic = config.format === 'anthropic'
              const resp = await fetch(
                isAnthropic ? `${config.baseUrl}/v1/messages` : `${config.baseUrl}/v1/chat/completions`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(isAnthropic
                      ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
                      : { 'Authorization': `Bearer ${config.apiKey}` }),
                  },
                  body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: 'user', content: message }],
                    max_tokens: 4096,
                  }),
                }
              )
              if (!resp.ok) {
                const errText = await resp.text().catch(() => '')
                throw new Error(`API error ${resp.status}: ${errText}`)
              }
              const data = await resp.json()
              text = isAnthropic
                ? data.content?.[0]?.text || '(no content)'
                : data.choices?.[0]?.message?.content || '(no response)'
            } else {
              text = `Echo: ${message}`
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ response: text }))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(OVERLAY_HTML)
        return
      }

      if (req.method === 'GET' && pathname === '/plugins') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(PLUGIN_HUB_HTML)
        return
      }

      if (req.method === 'GET' && pathname === '/api/plugins' && pluginManager) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(pluginManager.list()))
        return
      }

      if (req.method === 'POST' && pathname === '/api/plugins/install' && pluginManager) {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const { url } = JSON.parse(body)
            const name = await pluginManager.installFromGitHub(url)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ installed: name }))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/plugins/create' && pluginManager) {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const { name, files } = JSON.parse(body)
            const result = await pluginManager.createPlugin(name, files)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ created: result }))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/permissions/grants') {
        const agentId = parsedUrl.searchParams.get('agentId')
        if (!agentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'agentId query parameter is required' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(permBroker.getGrants(agentId)))
        return
      }

      if (req.method === 'POST' && pathname === '/api/permissions/approve') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { requestId, permanent } = JSON.parse(body)
            const ok = permBroker.approveRequest(requestId, permanent)
            res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(ok ? { status: 'approved' } : { error: 'Request not found' }))
          } catch {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Invalid request' }))
          }
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/permissions/deny') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { requestId } = JSON.parse(body)
            const ok = permBroker.denyRequest(requestId)
            res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(ok ? { status: 'denied' } : { error: 'Request not found' }))
          } catch {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Invalid request' }))
          }
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/projects') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(projectRegistry.list()))
        return
      }

      if (req.method === 'POST' && pathname === '/api/projects') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { name, path, description, aliases } = JSON.parse(body)
            const project = projectRegistry.register(name, path, { description, aliases })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(project))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/projects/occupy') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { projectId, agentId, sessionId } = JSON.parse(body)
            const occupant = projectRegistry.occupy(projectId, agentId, sessionId)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(occupant))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/projects/release') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { projectId } = JSON.parse(body)
            const occupant = projectRegistry.release(projectId)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(occupant || { status: 'already_free' }))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/jobs') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(jobScheduler.list()))
        return
      }

      if (req.method === 'POST' && pathname === '/api/jobs') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const { title, prompt, schedule, agentId, taskType, priority } = JSON.parse(body)
            const job = jobScheduler.register(title, prompt, schedule, { agentId, taskType, priority })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(job))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (req.method === 'POST' && pathname.startsWith('/api/jobs/') && pathname.endsWith('/run')) {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const jobId = pathname.split('/')[3]
            const result = await jobScheduler.runNow(jobId)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // SSE endpoint
      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })
        res.write(`event: connected\ndata: {}\n\n`)
        sseClients.add(res)
        const keepAlive = setInterval(() => {
          try {
            res.write(`:keepalive\n\n`)
          } catch {
            clearInterval(keepAlive)
            sseClients.delete(res)
          }
        }, 15000)
        req.on('close', () => {
          clearInterval(keepAlive)
          sseClients.delete(res)
        })
        req.on('error', () => {
          clearInterval(keepAlive)
          sseClients.delete(res)
        })
        return
      }

      // Dashboard REST endpoints
      if (req.method === 'GET' && pathname === '/api/memories') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(memStore.getMemories()))
        return
      }

      if (req.method === 'GET' && pathname === '/api/tasks') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          scheduled: memStore.listScheduledTasks(),
          missions: memStore.listMissions(),
        }))
        return
      }

      if (req.method === 'GET' && pathname === '/api/audit-log') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(memStore.getAuditEntries()))
        return
      }

      if (req.method === 'GET' && pathname === '/api/activity') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '50')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(memStore.getRecentActivity(limit)))
        return
      }

      if (req.method === 'GET' && pathname === '/api/hive-mind') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(memStore.getHiveEntries()))
        return
      }

      if (req.method === 'GET' && pathname === '/api/kanban/boards') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(memStore.listBoards()))
        return
      }

      const boardMatch = pathname.match(/^\/api\/kanban\/board\/(.+)$/)
      if (req.method === 'GET' && boardMatch) {
        const boardId = boardMatch[1]
        const board = memStore.getBoard(boardId)
        if (!board) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Board not found' }))
          return
        }
        const tasks = memStore.listTasks(boardId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ board, tasks }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    }

    const wss = new WebSocketServer({ noServer: true })
    const clients = new Set()
    const sseClients = new Set()

    wss.broadcast = (event) => {
      const payload = JSON.stringify({
        id: event.id || crypto.randomUUID(),
        ts: event.ts || Date.now(),
        type: event.type,
        data: event.data || {},
      })
      for (const ws of clients) {
        if (ws.readyState === 1) {
          ws.send(payload)
        }
      }
      for (const sse of sseClients) {
        try {
          sse.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data || {})}\n\n`)
        } catch {
          sseClients.delete(sse)
        }
      }
    }

    const memStore = new MemStore()

    const voiceRouter = new VoiceRouter({ broadcast: wss.broadcast })
    const storeDir = options.storeDir || join(__dirname, '..', 'store')
    const agentRegistry = new Registry({ dir: storeDir })
    const permBroker = new PermissionBroker({ broadcast: wss.broadcast, registry: agentRegistry, defaultTimeout: 50000 })

    const legacyMarker = join(storeDir, '.legacy-loaded')
    if (!existsSync(legacyMarker)) {
      try {
        const { LegacyAgentLoader } = await import('../bridge/legacy-agent-loader.js')
        const loader = new LegacyAgentLoader({
          baseDir: __dirname,
          agentsDir: join(__dirname, '..', 'agents'),
          registry: agentRegistry,
        })
        const loadResult = loader.loadAll()
        if (loadResult.loaded > 0) {
          console.log(`Loaded ${loadResult.loaded} legacy agents (${loadResult.skipped} skipped)`)
        }
        writeFileSync(legacyMarker, String(Date.now()), 'utf-8')
      } catch (err) {
        console.warn('Legacy agent loader skipped:', err.message)
      }
    }

    const migrateMarker = join(storeDir, '.migrated')
    if (!existsSync(migrateMarker)) {
      try {
        const { SqliteMigrator } = await import('../bridge/sqlite-migrate.js')
        const migrator = new SqliteMigrator({
          storeDir,
          workspaceDir: join(__dirname, '..', 'workspace'),
          broadcast: wss.broadcast,
        })
        const migrateResult = await migrator.migrate()
        if (migrateResult.memories > 0 || migrateResult.projects > 0) {
          console.log(`Migrated: ${migrateResult.memories} memories, ${migrateResult.projects} projects`)
        }
        writeFileSync(migrateMarker, String(Date.now()), 'utf-8')
      } catch (err) {
        console.warn('SQLite migrator skipped:', err.message)
      }
    }

    const projectRegistry = new ProjectRegistry({ broadcast: wss.broadcast, storeDir })
    const jobScheduler = new JobScheduler({
      broadcast: wss.broadcast,
      storeDir,
      createTask: async (task) => {
        try {
          let createKanbanTask
          try {
            ({ createKanbanTask } = await import('../dist/orchestrator.js'))
          } catch {
            ({ createKanbanTask } = await import('../src/orchestrator.js'))
          }
          return createKanbanTask('job-board', task.title, task.prompt, task.agentId, task.priority, undefined, task.taskType)
        } catch {
          return task
        }
      }
    })

    server.on('upgrade', (req, socket, head) => {
      const upgradeUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      if (upgradeUrl.pathname === '/ws') {
        const token = options.overlayAuth || process.env.OVERLAY_AUTH
        if (token) {
          const queryToken = upgradeUrl.searchParams.get('token')
          const protocolToken = req.headers['sec-websocket-protocol']
          const wsToken = queryToken || protocolToken
          if (wsToken !== token) {
            socket.destroy()
            return
          }
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          clients.add(ws)
          ws.on('close', () => clients.delete(ws))
          ws.on('error', () => clients.delete(ws))

          ws.on('message', (raw) => {
            try {
              const msg = JSON.parse(raw.toString())
              if (msg.type === 'chat' && msg.text) {
                wss.broadcast({
                  type: 'chat_reply',
                  data: { text: `Echo: ${msg.text}` },
                })
              }
              if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }))
              }
              if (msg.type === 'audio_chunk' && msg.data) {
                const buffer = Buffer.from(msg.data)
                voiceRouter.handlePushToTalk(buffer, { agentId: msg.agentId || 'main' })
              }
            } catch (err) {
              console.warn('Malformed WS message:', err.message)
            }
          })

          ws.send(JSON.stringify({
            type: 'connected',
            id: crypto.randomUUID(),
          }))

          // Forward permission events to the WebSocket
          const broadcastPermissionEvent = (type, data) => {
            wss.broadcast({ type, data, ts: Date.now() })
          }

          if (pluginManager && pluginManager.ctx) {
            pluginManager.ctx._wss = wss
            pluginManager.ctx.permBroker = permBroker
            pluginManager.ctx.projectRegistry = projectRegistry
            pluginManager.ctx.jobScheduler = jobScheduler
          }
        })
      } else {
        socket.destroy()
      }
    })

    const listenPort = process.env.DAEMON_PORT || options.port || 0
    server.listen(listenPort, host, () => {
      const port = server.address().port

      let redirectServer = null
      if (process.env.DISABLE_OLD_DASHBOARD !== 'true') {
        try {
          const redirect = createRedirectServer({ 
            oldPort: 3141, 
            newPort: parseInt(process.env.DAEMON_PORT) || 8787,
            listenAddr: '127.0.0.1',
          })
          redirect.start().catch(() => {})
          redirectServer = redirect
          console.log(`Old dashboard redirect listening on 127.0.0.1:3141 -> http://127.0.0.1:8787`)
        } catch {}
      }

      resolve({ server, port, wss, permBroker, projectRegistry, jobScheduler, redirectServer, agentRegistry })
    })

    server.on('close', () => {
      wss.close()
      sseClients.clear()
      clearInterval(rateLimitCleanupInterval)
      console.log('Server shut down')
    })

    server.on('error', reject)
  })
}
