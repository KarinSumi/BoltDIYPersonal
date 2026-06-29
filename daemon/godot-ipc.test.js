import { describe, it, expect, afterAll } from 'vitest'
import { createServer } from './server.js'

let server, port, wss

describe('Godot IPC: WebSocket to Daemon', () => {
  afterAll(() => {
    if (server) server.close()
  })

  it('should connect a mock Godot WS client and receive a world_state event', async () => {
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
      type: 'world_state',
      data: {
        grid: { rows: 3, cols: 3 },
        rooms: [
          { slot: 0, type: 'executive', label: 'Executive' },
          { slot: 1, type: 'operations', label: 'Operations' },
          { slot: 2, type: 'lobby', label: 'Lobby' },
        ],
        agents: [
          { id: 'ceo', name: 'CEO', position: { x: 0, z: 0 }, state: 'idle' },
        ],
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    const worldState = received.find((m) => m.type === 'world_state')
    expect(worldState).toBeDefined()
    expect(worldState.data.grid).toEqual({ rows: 3, cols: 3 })
    expect(worldState.data.rooms).toHaveLength(3)
    expect(worldState.data.agents).toHaveLength(1)
    expect(worldState.data.agents[0].id).toBe('ceo')

    ws.close()
  })
})
