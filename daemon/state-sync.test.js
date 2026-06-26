import { describe, it, expect, afterAll } from 'vitest'
import { createServer } from './server.js'

let server, port, wss

describe('Real-time State Sync', () => {
  afterAll(() => {
    if (server) server.close()
  })

  it('should broadcast agent_status_change to all connected WS clients', async () => {
    const result = await createServer({ probePort: true })
    server = result.server
    port = result.port
    wss = result.wss

    const { WebSocket } = await import('ws')
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`)

    // Wait for both to connect, flush welcome messages
    await Promise.all([
      new Promise((r) => { ws1.on('open', r); ws1.on('message', () => {}) }),
      new Promise((r) => { ws2.on('open', r); ws2.on('message', () => {}) }),
    ])

    // Register collectors before broadcasting
    const p1 = collectNextMessage(ws1)
    const p2 = collectNextMessage(ws2)

    // Emit internal event
    wss.broadcast({
      type: 'agent_status_change',
      data: { agentId: 'alice', status: 'WORKING' },
    })

    const [got1, got2] = await Promise.all([p1, p2])

    expect(got1.type).toBe('agent_status_change')
    expect(got1.data.agentId).toBe('alice')
    expect(got1.data.status).toBe('WORKING')
    expect(got1).toHaveProperty('ts')
    expect(got1).toHaveProperty('id')

    expect(got2.type).toBe('agent_status_change')
    expect(got2.data.agentId).toBe('alice')

    ws1.close()
    ws2.close()
  })

  it('should not broadcast to disconnected clients', async () => {
    const { WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

    await new Promise((r) => ws.on('open', r))
    ws.close()

    await new Promise((r) => setTimeout(r, 50))

    let received = false
    ws.on('message', () => { received = true })

    wss.broadcast({
      type: 'test_event',
      data: { msg: 'should not reach' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(received).toBe(false)
  })
})

function collectNextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 2000)
    ws.on('message', function handler(data) {
      clearTimeout(timeout)
      ws.removeListener('message', handler)
      resolve(JSON.parse(data.toString()))
    })
  })
}
