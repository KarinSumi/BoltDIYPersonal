import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TMP = join(tmpdir(), 'updater-test-' + Date.now())
const VERSION_FILE = join(TMP, 'VERSION')

beforeEach(() => {
  mkdirSync(TMP, { recursive: true })
  writeFileSync(VERSION_FILE, '1.0.0', 'utf-8')
})

afterEach(() => {
  try { unlinkSync(VERSION_FILE) } catch {}
  try { rmdirSync(TMP) } catch {}
  vi.restoreAllMocks()
})

describe('selfUpdate', () => {
  it('returns not-updated when versions match', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('1.0.0'),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const { selfUpdate } = await import('./updater.js')
    const result = await selfUpdate({ repoRoot: TMP, dryRun: true })

    expect(result).toEqual({ updated: false, currentVersion: '1.0.0' })
  })

  it('throws on network error', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('Network failure'))
    vi.stubGlobal('fetch', fakeFetch)

    const { selfUpdate } = await import('./updater.js')
    await expect(selfUpdate({ repoRoot: TMP, dryRun: true })).rejects.toThrow(
      'Could not check remote version'
    )
  })

  it('returns updated when versions differ', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('2.0.0'),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const { selfUpdate } = await import('./updater.js')
    const result = await selfUpdate({ repoRoot: TMP, dryRun: true })

    expect(result).toEqual({
      updated: true,
      currentVersion: '1.0.0',
      newVersion: '2.0.0',
    })
  })
})
