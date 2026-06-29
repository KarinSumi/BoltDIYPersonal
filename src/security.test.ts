import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnv = vi.hoisted(() => ({
  SECURITY_PIN_HASH: '',
  IDLE_LOCK_MINUTES: 30,
  EMERGENCY_KILL_PHRASE: '',
}))

vi.mock('./config.js', () => mockEnv)

const mockState = vi.hoisted(() => ({
  isSystemLocked: false,
  setLocked: vi.fn(),
  touchActivity: vi.fn(),
}))

vi.mock('./state.js', () => mockState)

vi.mock('./db.js', () => ({
  insertAuditEntry: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

describe('security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockEnv.SECURITY_PIN_HASH = 'salt:hash'
    mockEnv.IDLE_LOCK_MINUTES = 30
    mockEnv.EMERGENCY_KILL_PHRASE = ''
    mockState.isSystemLocked = false
    mockState.setLocked.mockReset()
    mockState.touchActivity.mockReset()
  })

  describe('setPinHash', () => {
    it('returns salt:hash format', async () => {
      const { setPinHash } = await import('./security.js')
      const result = setPinHash('1234')
      expect(result).toMatch(/^[a-f0-9]{32}:[a-f0-9]{64}$/)
    })

    it('produces different hashes for same pin due to salt', async () => {
      const { setPinHash } = await import('./security.js')
      const a = setPinHash('1234')
      const b = setPinHash('1234')
      expect(a).not.toBe(b)
    })
  })

  describe('verifyPin', () => {
    it('returns true for correct pin', async () => {
      const { setPinHash, verifyPin } = await import('./security.js')
      const stored = setPinHash('1234')
      expect(verifyPin('1234', stored)).toBe(true)
    })

    it('returns false for wrong pin', async () => {
      const { setPinHash, verifyPin } = await import('./security.js')
      const stored = setPinHash('1234')
      expect(verifyPin('wrong', stored)).toBe(false)
    })
  })

  describe('isLocked', () => {
    it('returns false when no PIN configured', async () => {
      mockEnv.SECURITY_PIN_HASH = ''
      const { isLocked: checkLocked } = await import('./security.js')
      expect(checkLocked()).toBe(false)
    })

    it('returns true when isSystemLocked is true', async () => {
      mockState.isSystemLocked = true
      const { isLocked: checkLocked } = await import('./security.js')
      expect(checkLocked()).toBe(true)
    })
  })

  describe('unlock', () => {
    it('returns true and unlocks when PIN is valid', async () => {
      const { setPinHash, unlock } = await import('./security.js')
      mockEnv.SECURITY_PIN_HASH = setPinHash('1234')
      const result = unlock('1234')
      expect(result).toBe(true)
      expect(mockState.setLocked).toHaveBeenCalledWith(false)
      expect(mockState.touchActivity).toHaveBeenCalled()
    })

    it('returns false for invalid PIN', async () => {
      const { unlock } = await import('./security.js')
      expect(unlock('wrong')).toBe(false)
      expect(mockState.setLocked).not.toHaveBeenCalled()
    })

    it('returns true when no PIN configured', async () => {
      mockEnv.SECURITY_PIN_HASH = ''
      const { unlock } = await import('./security.js')
      expect(unlock('anything')).toBe(true)
    })
  })

  describe('lock', () => {
    it('calls setLocked(true)', async () => {
      const { lock: lockFn } = await import('./security.js')
      lockFn()
      expect(mockState.setLocked).toHaveBeenCalledWith(true)
    })

    it('does nothing when no PIN configured', async () => {
      mockEnv.SECURITY_PIN_HASH = ''
      const { lock: lockFn } = await import('./security.js')
      lockFn()
      expect(mockState.setLocked).not.toHaveBeenCalled()
    })
  })

  describe('resetIdleTimer', () => {
    it('sets a timeout that calls lock after IDLE_LOCK_MINUTES', async () => {
      const { setPinHash, resetIdleTimer } = await import('./security.js')
      mockEnv.SECURITY_PIN_HASH = setPinHash('1234')
      resetIdleTimer()
      vi.advanceTimersByTime(30 * 60 * 1000)
      expect(mockState.setLocked).toHaveBeenCalledWith(true)
    })

    it('does nothing when no PIN configured', async () => {
      const { resetIdleTimer } = await import('./security.js')
      resetIdleTimer()
      expect(mockState.setLocked).not.toHaveBeenCalled()
    })
  })

  describe('checkKillPhrase', () => {
    let exitSpy: any

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    })

    it('returns false when no kill phrase configured', async () => {
      mockEnv.EMERGENCY_KILL_PHRASE = ''
      const { checkKillPhrase } = await import('./security.js')
      expect(checkKillPhrase('anything')).toBe(false)
      expect(exitSpy).not.toHaveBeenCalled()
    })

    it('calls process.exit when kill phrase matches', async () => {
      mockEnv.EMERGENCY_KILL_PHRASE = 'shutdown now'
      const { checkKillPhrase } = await import('./security.js')
      checkKillPhrase('Shutdown Now')
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('returns false for non-matching text', async () => {
      mockEnv.EMERGENCY_KILL_PHRASE = 'shutdown now'
      const { checkKillPhrase } = await import('./security.js')
      expect(checkKillPhrase('hello')).toBe(false)
      expect(exitSpy).not.toHaveBeenCalled()
    })
  })
})
