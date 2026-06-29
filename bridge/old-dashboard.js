import { createServer } from 'http'

const DEFAULT_OLD_PORT = 3141
const DEFAULT_NEW_PORT = parseInt(process.env.DAEMON_PORT) || 8787
const DEFAULT_NEW_HOST = '127.0.0.1'
const LISTEN_ADDR = '127.0.0.1'

/**
 * Create an HTTP server that redirects all requests to the new dashboard
 * @param {object} options
 * @param {number} [options.oldPort=3141]
 * @param {number} [options.newPort=8787]
 * @param {string} [options.newHost='127.0.0.1']
 * @returns {{ server: import('http').Server, start: Function, stop: Function }}
 */
export function createRedirectServer(options = {}) {
  const listenAddr = options.listenAddr || LISTEN_ADDR
  const oldPort = options.oldPort ?? DEFAULT_OLD_PORT
  const newPort = options.newPort ?? DEFAULT_NEW_PORT
  const newHost = options.newHost ?? DEFAULT_NEW_HOST
  const baseUrl = `http://${newHost}:${newPort}`

  const server = createServer((req, res) => {
    const redirectUrl = `${baseUrl}${req.url || '/'}`

    // 301 Moved Permanently for GET/HEAD, 308 for others (preserves method+body)
    const statusCode = (req.method === 'GET' || req.method === 'HEAD') ? 301 : 308

    res.writeHead(statusCode, {
      'Location': redirectUrl,
      'Cache-Control': 'no-cache',
      'X-Redirect-Reason': 'OpenCode OS migration - new dashboard at ' + baseUrl,
    })
    res.end()
  })

  function start() {
    return new Promise((resolve, reject) => {
      server.listen(oldPort, listenAddr, () => {
        resolve()
      })
      server.on('error', reject)
    })
  }

  function stop() {
    return new Promise((resolve) => {
      server.close(() => resolve())
    })
  }

  return { server, start, stop }
}

export default createRedirectServer
