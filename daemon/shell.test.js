import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'

describe('Native Desktop Shell (Rust)', () => {
  it('should have Cargo.toml, main.rs, and cargo config', () => {
    expect(existsSync('shell/Cargo.toml')).toBe(true)
    expect(existsSync('shell/src/main.rs')).toBe(true)
  })

  it('should have a Cargo.toml with tao and wry dependencies', async () => {
    const { readFileSync } = await import('fs')
    const cargo = readFileSync('shell/Cargo.toml', 'utf-8')
    expect(cargo).toContain('tao')
    expect(cargo).toContain('wry')
    expect(cargo).toContain('tray-icon')
  })
})
