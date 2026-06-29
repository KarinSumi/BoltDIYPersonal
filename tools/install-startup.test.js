import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  }
})

describe('install-startup', () => {
  it('installStartup returns install result for current platform', async () => {
    const { installStartup } = await import('./install-startup.js')
    const result = installStartup()

    expect(result).toHaveProperty('platform')
    expect(result).toHaveProperty('installed')
    expect(result.installed).toBe(true)
    expect(['win32', 'darwin', 'linux']).toContain(result.platform)
  })

  it('uninstallStartup returns uninstall result for current platform', async () => {
    const { uninstallStartup } = await import('./install-startup.js')
    const result = uninstallStartup()

    expect(result).toHaveProperty('platform')
    expect(result).toHaveProperty('installed')
    expect(result.installed).toBe(false)
    expect(['win32', 'darwin', 'linux']).toContain(result.platform)
  })
})
