import { describe, it, expect, afterAll } from 'vitest'
import { createServer } from './server.js'

let server, port

describe('Daemon HTTP + WebSocket Server', () => {
  afterAll(() => {
    if (server) server.close()
  })

  it('should start on a random available port and return 200 from /api/health', async () => {
    const result = await createServer({ probePort: true })
    server = result.server
    port = result.port

    expect(port).toBeGreaterThan(0)
    expect(server.listening).toBe(true)

    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('status', 'ok')
  })

  it('should upgrade WebSocket connections and send a welcome event', async () => {
    const { WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

    const msg = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 3000)
      ws.on('message', (data) => {
        clearTimeout(timeout)
        resolve(JSON.parse(data.toString()))
      })
      ws.on('error', reject)
    })

    expect(msg).toHaveProperty('type', 'connected')
    expect(msg).toHaveProperty('id')

    ws.close()
  })
})
