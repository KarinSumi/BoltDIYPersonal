import { logger } from './logger.js'

interface GateState {
  cooldownUntil: number
  currentRetryAfterMs: number
  gateTriggered: boolean
}

const gates = new Map<string, GateState>()

export function checkGate(model: string): { blocked: boolean; waitMs: number } {
  const now = Date.now()
  const gate = gates.get(model)
  if (gate && now < gate.cooldownUntil) {
    return { blocked: true, waitMs: gate.cooldownUntil - now }
  }
  return { blocked: false, waitMs: 0 }
}

export function tripGate(model: string, retryAfterMs: number): void {
  const now = Date.now()
  const cooldownUntil = now + retryAfterMs
  gates.set(model, {
    cooldownUntil,
    currentRetryAfterMs: retryAfterMs,
    gateTriggered: true,
  })
  logger.warn({ model, retryAfterMs, cooldownUntil: new Date(cooldownUntil).toISOString() }, 'Rate-limit gate tripped')
}

export function isGateTripped(model: string): boolean {
  return gates.get(model)?.gateTriggered ?? false
}

export function getRetryAfterMs(model: string): number {
  return gates.get(model)?.currentRetryAfterMs ?? 0
}

export function resetGate(model?: string): void {
  if (model) {
    gates.delete(model)
  } else {
    gates.clear()
  }
}
