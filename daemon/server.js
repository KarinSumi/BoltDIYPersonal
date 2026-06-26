import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { WebSocketServer } from 'ws'
import crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OVERLAY_HTML = readFileSync(join(__dirname, 'overlay.html'), 'utf-8')

export function createServer(options = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
        return
      }

      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(OVERLAY_HTML)
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })

    const wss = new WebSocketServer({ noServer: true })
    const clients = new Set()

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
    }

    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws') {
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
            } catch {
              // ignore malformed messages
            }
          })

          ws.send(JSON.stringify({
            type: 'connected',
            id: crypto.randomUUID(),
          }))
        })
      } else {
        socket.destroy()
      }
    })

    const listenPort = options.port || 0
    server.listen(listenPort, '127.0.0.1', () => {
      const port = server.address().port
      resolve({ server, port, wss })
    })

    server.on('error', reject)
  })
}
