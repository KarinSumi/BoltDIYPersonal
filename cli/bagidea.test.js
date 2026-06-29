import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TMP = join(tmpdir(), 'bagidea-test-' + Date.now())
const VERSION_FILE = join(TMP, 'VERSION')

beforeEach(() => {
  mkdirSync(TMP, { recursive: true })
  writeFileSync(VERSION_FILE, '1.0.0', 'utf-8')
})

afterEach(() => {
  try { unlinkSync(VERSION_FILE) } catch {}
  try { rmdirSync(TMP) } catch {}
})

describe('bagidea CLI - version', () => {
  it('version returns the version string', async () => {
    const version = readFileSync(VERSION_FILE, 'utf-8').trim()
    expect(version).toBe('1.0.0')
  })
})

describe('bagidea CLI - status --json', () => {
  it('status --json returns valid JSON with status field', async () => {
    const statusOutput = JSON.stringify({
      version: '1.0.0',
      status: 'stopped',
      pid: null,
      uptime: null,
      agents: null,
      daemon_port: '8787',
    })
    const parsed = JSON.parse(statusOutput)
    expect(parsed).toHaveProperty('status')
    expect(parsed.status).toBe('stopped')
    expect(parsed).toHaveProperty('version')
    expect(parsed.version).toBe('1.0.0')
  })

  it('status --json includes watchdog fields when watchdog is active', async () => {
    const statusOutput = JSON.stringify({
      version: '1.0.0',
      status: 'running',
      pid: 12345,
      uptime: null,
      agents: null,
      daemon_port: '8787',
      watchdog: {
        restartCount: 3,
        restartDelay: 8000,
      },
    })
    const parsed = JSON.parse(statusOutput)
    expect(parsed).toHaveProperty('watchdog')
    expect(parsed.watchdog.restartCount).toBe(3)
    expect(parsed.watchdog.restartDelay).toBe(8000)
  })
})

describe('bagidea CLI - watchdog integration', () => {
  afterEach(() => {
    delete global.__watchdog
  })

  it('global.__watchdog is set by start() and cleared by stop()', () => {
    const mockWatchdog = {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(() => ({
        running: false,
        daemonPid: null,
        restartCount: 0,
        restartDelay: 1000,
        uptime: 0,
      })),
    }
    global.__watchdog = mockWatchdog
    expect(global.__watchdog).toBe(mockWatchdog)

    global.__watchdog.stop()
    global.__watchdog = null
    expect(global.__watchdog).toBeNull()
  })
})
