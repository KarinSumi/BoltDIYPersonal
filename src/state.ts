import { EventEmitter } from 'events'

export type ChatEventType =
  | 'user_message'
  | 'assistant_message'
  | 'processing'
  | 'progress'
  | 'error'
  | 'hive_mind'
  | 'memory'
  | 'task'

export interface ChatEvent {
  type: ChatEventType
  chatId: string
  agentId?: string
  data: unknown
  timestamp: number
}

export const chatEvents = new EventEmitter()
export const voiceEnabledChats = new Set<string>()
export const activeSessions = new Map<string, { startedAt: number; agentId?: string }>()
export const abortControllers = new Map<string, AbortController>()

export let isSystemLocked = true
export let lastActivityAt = Date.now()

export function touchActivity(): void { lastActivityAt = Date.now() }
export function setLocked(locked: boolean): void { isSystemLocked = locked }
