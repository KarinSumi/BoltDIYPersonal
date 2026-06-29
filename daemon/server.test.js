import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { createServer } from './server.js'
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const TEST_STORE = join(import.meta.dirname, '..', 'store', 'test-' + randomUUID().slice(0, 8))

let server, port, wss

beforeAll(async () => {
  mkdirSync(TEST_STORE, { recursive: true })
  const result = await createServer({ port: 0, storeDir: TEST_STORE })
  server = result.server
  port = result.port
  wss = result.wss
})

afterAll(() => {
  server.close()
  try { rmSync(TEST_STORE, { recursive: true, force: true }) } catch {}
})

function fetch(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    }
    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let json
        try { json = JSON.parse(data) } catch { json = data }
        resolve({ status: res.statusCode, headers: res.headers, data, json })
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

describe('server.js', () => {
  it('starts on a random available port', () => {
    expect(port).toBeGreaterThan(0)
    expect(server.listening).toBe(true)
  })

  it('GET /api/health returns ok with uptime', async () => {
    const res = await fetch('GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.json.status).toBe('ok')
    expect(typeof res.json.uptime).toBe('number')
  })

  it('GET /api/agents returns agent list (may be populated by legacy loader)', async () => {
    const res = await fetch('GET', '/api/agents')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/agents/status returns status array', async () => {
    const res = await fetch('GET', '/api/agents/status')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
    if (res.json.length > 0) {
      expect(res.json[0]).toHaveProperty('agent_id')
      expect(res.json[0]).toHaveProperty('status')
    }
  })

  it('GET / returns HTML', async () => {
    const res = await fetch('GET', '/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('GET /plugins returns HTML', async () => {
    const res = await fetch('GET', '/plugins')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('POST /api/permissions/approve returns 404 for unknown request', async () => {
    const res = await fetch('POST', '/api/permissions/approve', { requestId: 'nonexistent', permanent: false })
    expect(res.status).toBe(404)
  })

  it('POST /api/permissions/deny returns 404 for unknown request', async () => {
    const res = await fetch('POST', '/api/permissions/deny', { requestId: 'nonexistent' })
    expect(res.status).toBe(404)
    expect(res.json.error).toBe('Request not found')
  })

  it('POST /api/projects creates a project', async () => {
    const name = `TestProject-${Date.now()}`
    const res = await fetch('POST', '/api/projects', { name, path: '/tmp/test-project' })
    expect(res.status).toBe(200)
    expect(res.json.id).toBeTruthy()
    expect(res.json.name).toBe(name)
    expect(res.json.path).toBe('/tmp/test-project')
  })

  it('GET /api/projects lists projects', async () => {
    const res = await fetch('GET', '/api/projects')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
    expect(res.json.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/plugins returns 404 without pluginManager', async () => {
    const res = await fetch('GET', '/api/plugins')
    expect(res.status).toBe(404)
  })

  it('GET /api/activity returns empty list', async () => {
    const res = await fetch('GET', '/api/activity')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/tasks returns object with scheduled and missions', async () => {
    const res = await fetch('GET', '/api/tasks')
    expect(res.status).toBe(200)
    expect(res.json).toHaveProperty('scheduled')
    expect(res.json).toHaveProperty('missions')
  })

  it('GET /api/memories returns array', async () => {
    const res = await fetch('GET', '/api/memories')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/audit-log returns array', async () => {
    const res = await fetch('GET', '/api/audit-log')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/hive-mind returns array', async () => {
    const res = await fetch('GET', '/api/hive-mind')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/kanban/boards returns array', async () => {
    const res = await fetch('GET', '/api/kanban/boards')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('GET /api/kanban/board/:id returns 404 for unknown board', async () => {
    const res = await fetch('GET', '/api/kanban/board/nonexistent')
    expect(res.status).toBe(404)
    expect(res.json.error).toBe('Board not found')
  })

  it('GET /api/events returns SSE stream', async () => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      method: 'GET',
      path: '/api/events',
    }
    const res = await new Promise((resolve, reject) => {
      const req = http.request(opts, (r) => {
        resolve({ status: r.statusCode, headers: r.headers })
        r.destroy()
      })
      req.on('error', reject)
      req.end()
    })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
  })

  it('OPTIONS request returns 204 with CORS headers', async () => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      method: 'OPTIONS',
      path: '/api/health',
    }
    const res = await new Promise((resolve, reject) => {
      const req = http.request(opts, (r) => {
        r.resume()
        r.on('end', () => {
          resolve({ status: r.statusCode, headers: r.headers })
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await fetch('GET', '/api/nonexistent')
    expect(res.status).toBe(404)
    expect(res.json.error).toBe('not found')
  })
})

describe('auth middleware', () => {
  let authServer, authPort

  beforeAll(async () => {
    const result = await createServer({ port: 0, overlayAuth: 'test-token', storeDir: TEST_STORE })
    authServer = result.server
    authPort = result.port
  })

  afterAll(() => {
    authServer.close()
    try { rmSync(TEST_STORE, { recursive: true, force: true }) } catch {}
  })

  function authFetch(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port: authPort,
        method,
        path,
        headers: body ? { 'Content-Type': 'application/json', ...headers } : { ...headers },
      }
      const req = http.request(opts, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          let json
          try { json = JSON.parse(data) } catch { json = data }
          resolve({ status: res.statusCode, headers: res.headers, data, json })
        })
      })
      req.on('error', reject)
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }

  it('allows GET / without auth', async () => {
    const res = await authFetch('GET', '/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('blocks unauthenticated requests with 401', async () => {
    const res = await authFetch('GET', '/api/health')
    expect(res.status).toBe(401)
    expect(res.json.error).toBe('Unauthorized')
  })

  it('returns 403 for invalid bearer token', async () => {
    const res = await authFetch('GET', '/api/health', null, { authorization: 'Bearer wrong-token' })
    expect(res.status).toBe(403)
    expect(res.json.error).toBe('Forbidden')
  })

  it('returns 401 for non-Bearer Authorization header', async () => {
    const res = await authFetch('GET', '/api/health', null, { authorization: 'Basic dXNlcjpwYXNz' })
    expect(res.status).toBe(401)
    expect(res.json.error).toBe('Unauthorized')
  })

  it('allows authenticated requests with valid token', async () => {
    const res = await authFetch('GET', '/api/health', null, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(200)
    expect(res.json.status).toBe('ok')
  })

  it('allows authenticated POST requests', async () => {
    const res = await authFetch('POST', '/api/projects', { name: 'AuthTest', path: '/tmp/auth-test' }, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(200)
    expect(res.json.name).toBe('AuthTest')
  })

  it('blocks POST without auth', async () => {
    const res = await authFetch('POST', '/api/projects', { name: 'AuthTest2', path: '/tmp/auth-test2' })
    expect(res.status).toBe(401)
  })

  it('blocks /plugins route without auth', async () => {
    const res = await authFetch('GET', '/plugins')
    expect(res.status).toBe(401)
  })

  it('allows /plugins route with valid auth', async () => {
    const res = await authFetch('GET', '/plugins', null, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('blocks GET /api/agents without auth', async () => {
    const res = await authFetch('GET', '/api/agents')
    expect(res.status).toBe(401)
  })

  it('blocks POST /api/chat without auth', async () => {
    const res = await authFetch('POST', '/api/chat', { message: 'hello' })
    expect(res.status).toBe(401)
  })

  it('allows GET /api/agents with valid auth', async () => {
    const res = await authFetch('GET', '/api/agents', null, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json)).toBe(true)
  })

  it('POST /api/chat returns 400 when message is missing', async () => {
    const res = await authFetch('POST', '/api/chat', {}, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(400)
  })

  it('POST /api/chat returns echo when no API key configured', async () => {
    const res = await authFetch('POST', '/api/chat', { message: 'Hello' }, { authorization: 'Bearer test-token' })
    expect(res.status).toBe(200)
    expect(res.json.response).toBe('Echo: Hello')
  })

  it('blocks GET /api/activity without auth', async () => {
    const res = await authFetch('GET', '/api/activity')
    expect(res.status).toBe(401)
  })

  it('blocks GET /api/events without auth', async () => {
    const res = await authFetch('GET', '/api/events')
    expect(res.status).toBe(401)
  })
})

describe('HTTPS fallback', () => {
  it('falls back to HTTP when only SSL_CERT_PATH is set', async () => {
    const { server: s } = await createServer({ port: 0, sslCert: 'C:\\nonexistent\\cert.pem' })
    expect(s.listening).toBe(true)
    s.close()
  })

  it('falls back to HTTP when only SSL_KEY_PATH is set', async () => {
    const { server: s } = await createServer({ port: 0, sslKey: 'C:\\nonexistent\\key.pem' })
    expect(s.listening).toBe(true)
    s.close()
  })

  it('falls back to HTTP when cert files do not exist', async () => {
    const { server: s } = await createServer({ port: 0, sslCert: 'C:\\nonexistent\\cert.pem', sslKey: 'C:\\nonexistent\\key.pem' })
    expect(s.listening).toBe(true)
    s.close()
  })

  it('creates HTTP server without SSL options', async () => {
    const { server: s } = await createServer({ port: 0 })
    expect(s.listening).toBe(true)
    s.close()
  })
})
