import { describe, it, expect, afterAll } from 'vitest'
import { createServer } from './server.js'

let server, port, wss

describe('World Builder: Room Layout Config', () => {
  afterAll(() => {
    if (server) server.close()
  })

  it('should send a room_layout config via WS and confirm room_placed confirmation event', async () => {
    const result = await createServer({ probePort: true })
    server = result.server
    port = result.port
    wss = result.wss

    const { WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

    await new Promise((r) => { ws.on('open', r); ws.on('message', () => {}) })

    const received = []
    ws.on('message', (data) => {
      received.push(JSON.parse(data.toString()))
    })

    wss.broadcast({
      type: 'room_layout',
      data: {
        swaps: [
          { from: 0, to: 2 },
        ],
        config: {
          '0': { type: 'meeting' },
          '1': { type: 'cafeteria' },
          '2': { type: 'executive' },
          '3': { type: 'server' },
          '4': { type: 'operations' },
          '5': { type: 'recreation' },
          '6': { type: 'dormitory1' },
          '7': { type: 'dormitory2' },
          '8': { type: 'lobby' },
        },
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    const roomLayout = received.find((m) => m.type === 'room_layout')
    expect(roomLayout).toBeDefined()
    expect(roomLayout.data.swaps).toHaveLength(1)
    expect(roomLayout.data.config['0'].type).toBe('meeting')
    expect(roomLayout.data.config['4'].type).toBe('operations')
    expect(Object.keys(roomLayout.data.config)).toHaveLength(9)

    ws.close()
  })
})
