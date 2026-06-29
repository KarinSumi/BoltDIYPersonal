import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnv = vi.hoisted(() => ({
  _: {} as Record<string, string>,
}))

vi.mock('./env.js', () => ({
  readEnvFile: () => mockEnv._,
  PROJECT_ROOT: 'C:\\test\\root',
}))

describe('config', () => {
  beforeEach(() => {
    mockEnv._ = {}
    vi.resetModules()
  })

  it('has default STORE_DIR', async () => {
    const mod = await import('./config.js')
    expect(mod.STORE_DIR).toBeTruthy()
  })

  it('has default OPENCODE_MODEL', async () => {
    const mod = await import('./config.js')
    expect(mod.OPENCODE_MODEL).toBe('deepseek-ai/deepseek-v4-flash')
  })

  it('reads TASK_TIMEOUT_* defaults', async () => {
    const mod = await import('./config.js')
    expect(mod.TASK_TIMEOUT_NIM_MS).toBe(60000)
    expect(mod.TASK_TIMEOUT_OPENCODE_MS).toBe(900000)
  })

  it('has OPENCODE_SERVER_PORT default', async () => {
    const mod = await import('./config.js')
    expect(mod.OPENCODE_SERVER_PORT).toBe(4096)
  })

  it('respects OPENCODE_MODEL env override', async () => {
    mockEnv._['OPENCODE_MODEL'] = 'custom-model'
    const mod = await import('./config.js')
    expect(mod.OPENCODE_MODEL).toBe('custom-model')
  })

  it('respects TASK_TIMEOUT_NIM_MS env override', async () => {
    mockEnv._['TASK_TIMEOUT_NIM_MS'] = '12345'
    const mod = await import('./config.js')
    expect(mod.TASK_TIMEOUT_NIM_MS).toBe(12345)
  })

  it('respects OPENCODE_SERVER_PORT env override', async () => {
    mockEnv._['OPENCODE_SERVER_PORT'] = '9999'
    const mod = await import('./config.js')
    expect(mod.OPENCODE_SERVER_PORT).toBe(9999)
  })

  it('has LOG_LEVEL default', async () => {
    const mod = await import('./config.js')
    expect(mod.LOG_LEVEL).toBe('info')
  })

  it('has DASHBOARD_PORT default', async () => {
    const mod = await import('./config.js')
    expect(mod.DASHBOARD_PORT).toBe(3141)
  })
})
