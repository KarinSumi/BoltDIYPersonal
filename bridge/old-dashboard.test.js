import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import http from 'http'
import { createRedirectServer } from './old-dashboard.js'

function request(server, method, path) {
  return new Promise((resolve, reject) => {
    const addr = server.address()
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, method, path },
      (res) => {
        res.resume()
        resolve({ statusCode: res.statusCode, headers: res.headers })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

describe('old-dashboard redirect server', () => {
  let redirect

  beforeAll(async () => {
    redirect = createRedirectServer({ oldPort: 0 })
    await redirect.start()
  })

  afterAll(async () => {
    await redirect.stop()
  })

  it('redirects GET requests with 301', async () => {
    const { statusCode, headers } = await request(redirect.server, 'GET', '/')
    expect(statusCode).toBe(301)
    expect(headers.location).toBeTruthy()
    expect(headers.location).toMatch(/^http:\/\/127\.0\.0\.1:8787/)
  })

  it('redirects POST requests with 308', async () => {
    const { statusCode, headers } = await request(redirect.server, 'POST', '/')
    expect(statusCode).toBe(308)
    expect(headers.location).toBeTruthy()
  })

  it('preserves the URL path in redirect', async () => {
    const { headers } = await request(redirect.server, 'GET', '/some/path')
    expect(headers.location).toMatch(/\/some\/path$/)
  })
})
