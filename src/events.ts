import { EventEmitter } from 'events'
import { chatEvents } from './state.js'

type SSECallback = (event: string, data: unknown) => void

const sseClients = new Set<SSECallback>()
const bus = new EventEmitter()
bus.setMaxListeners(100)
bus.on('error', () => {})

export interface ActivityEntry {
  timestamp: number
  event: string
  summary: string
}

const activityRing: ActivityEntry[] = []
const MAX_ACTIVITY = 100

function pushActivity(event: string, summary: string, timestamp: number): void {
  activityRing.push({ timestamp, event, summary })
  if (activityRing.length > MAX_ACTIVITY) activityRing.shift()
}

export function getRecentActivity(limit = 50): ActivityEntry[] {
  return activityRing.slice(-limit).reverse()
}

// Wire chatEvents from state.ts to SSE bus
chatEvents.on('task', (payload: { taskId: string; agentId: string; status: string; timestamp: number }) => {
  const eventType = payload.status === 'completed' ? 'task_completed' : 'task_failed'
  const summary = `Task ${payload.taskId.slice(0, 8)} ${payload.status} on ${payload.agentId}`
  pushActivity(eventType, summary, payload.timestamp)
  emitEvent(eventType, { taskId: payload.taskId, agentId: payload.agentId, timestamp: payload.timestamp })
})

chatEvents.on('user_message', (payload: { chatId: string; agentId?: string; data: unknown; timestamp: number }) => {
  pushActivity('user_message', 'User message received', payload.timestamp)
  emitEvent('user_message', { chatId: payload.chatId, agentId: payload.agentId, timestamp: payload.timestamp })
})

chatEvents.on('assistant_message', (payload: { chatId: string; agentId?: string; data: unknown; timestamp: number }) => {
  pushActivity('assistant_message', 'Assistant response sent', payload.timestamp)
  emitEvent('assistant_message', { chatId: payload.chatId, agentId: payload.agentId, timestamp: payload.timestamp })
})

chatEvents.on('error', (payload: { chatId: string; agentId?: string; data: unknown; timestamp: number }) => {
  const msg = typeof payload.data === 'string' ? payload.data.slice(0, 80) : 'Unknown error'
  pushActivity('error', msg, payload.timestamp)
  emitEvent('error', { chatId: payload.chatId, agentId: payload.agentId, message: payload.data, timestamp: payload.timestamp })
})

export function pushActivityEntry(event: string, summary: string, timestamp?: number): void {
  pushActivity(event, summary, timestamp ?? Date.now())
}

export function emitEvent(event: string, data: unknown): void {
  bus.emit(event, data)
  for (const cb of sseClients) {
    try { cb(event, data) } catch { /* ignore */ }
  }
}

export function subscribeToSSE(cb: SSECallback): () => void {
  sseClients.add(cb)
  return () => { sseClients.delete(cb) }
}

export function emitHeartbeat(status: 'ok' | 'degraded' | 'down'): void {
  pushActivity('heartbeat_tick', `Heartbeat: ${status}`, Date.now())
  emitEvent('heartbeat_tick', { status, timestamp: Date.now() })
}

export function getSSEClientCount(): number {
  return sseClients.size
}
