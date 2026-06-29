import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  spawn: (...args) => mockSpawn(...args),
}))

let mockWriteFileSync
let mockExistsSync
let mockMkdirSync

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    writeFileSync: (...args) => {
      if (mockWriteFileSync) mockWriteFileSync(...args)
      else actual.writeFileSync(...args)
    },
    existsSync: (...args) => {
      if (mockExistsSync) return mockExistsSync(...args)
      return actual.existsSync(...args)
    },
    mkdirSync: (...args) => {
      if (mockMkdirSync) mockMkdirSync(...args)
      else actual.mkdirSync(...args)
    },
  }
})

function createMockProcess() {
  const handlers = {}
  return {
    pid: 12345,
    on: vi.fn((event, handler) => {
      handlers[event] = handler
    }),
    kill: vi.fn(),
    _emit(event, ...args) {
      if (handlers[event]) handlers[event](...args)
    },
  }
}

describe('Watchdog', () => {
  let Watchdog
  let mockProcess
  let watchdog

  beforeEach(async () => {
    mockWriteFileSync = vi.fn()
    mockExistsSync = vi.fn(() => true)
    mockMkdirSync = vi.fn()
    mockProcess = createMockProcess()
    mockSpawn.mockReturnValue(mockProcess)

    const mod = await import('./watchdog.js')
    Watchdog = mod.Watchdog
  })

  afterEach(() => {
    if (watchdog) {
      watchdog.stop()
    }
    vi.restoreAllMocks()
  })

  it('start spawns daemon process', () => {
    watchdog = new Watchdog({ checkInterval: 10000 })

    watchdog.start()

    expect(mockSpawn).toHaveBeenCalledWith('node', [expect.stringContaining('server.js')], expect.any(Object))
    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'), '12345', 'utf-8')
    expect(watchdog.getStatus().daemonPid).toBe(12345)
    expect(watchdog.getStatus().running).toBe(true)
  })

  it('stop kills daemon and stops monitoring', () => {
    watchdog = new Watchdog({ checkInterval: 10000 })
    watchdog.start()

    expect(watchdog.daemonProcess).not.toBeNull()

    watchdog.stop()

    expect(watchdog.daemonProcess).toBeNull()
    expect(watchdog.isRunning).toBe(false)
  })

  it('getStatus returns status object', () => {
    watchdog = new Watchdog({ checkInterval: 10000 })
    watchdog.start()

    const status = watchdog.getStatus()

    expect(status).toHaveProperty('running')
    expect(status).toHaveProperty('daemonPid')
    expect(status).toHaveProperty('restartCount')
    expect(status).toHaveProperty('restartDelay')
    expect(status).toHaveProperty('uptime')
    expect(status.running).toBe(true)
    expect(status.daemonPid).toBe(12345)
    expect(status.restartCount).toBe(0)
  })

  it('resetBackoff resets restart delay', () => {
    watchdog = new Watchdog({ checkInterval: 10000 })

    watchdog.restartDelay = 16000
    watchdog.restartCount = 5

    watchdog.resetBackoff()

    expect(watchdog.restartDelay).toBe(1000)
    expect(watchdog.restartCount).toBe(0)
  })
})
