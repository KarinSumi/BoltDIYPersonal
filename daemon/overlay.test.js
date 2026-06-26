import { describe, it, expect, afterAll } from 'vitest'
import { createServer } from './server.js'

let server, port

describe('Overlay UI Shell', () => {
  afterAll(() => {
    if (server) server.close()
  })

  it('should serve the overlay HTML at GET /', async () => {
    const result = await createServer({ probePort: true })
    server = result.server
    port = result.port

    const res = await fetch(`http://127.0.0.1:${port}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html>')
  })

  it('should respond with chat_reply when client sends a chat message over WS', async () => {
    const { WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

    // Wait for connect + flush welcome
    await new Promise((r) => { ws.on('open', r); ws.on('message', () => {}) })

    ws.send(JSON.stringify({
      type: 'chat',
      text: 'Hello',
    }))

    const reply = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 3000)
      ws.on('message', (data) => {
        clearTimeout(timeout)
        resolve(JSON.parse(data.toString()))
      })
    })

    expect(reply.type).toBe('chat_reply')
    expect(reply.data).toHaveProperty('text')
    expect(reply.data.text).toBeTruthy()

    ws.close()
  })
})
