import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./config.js', () => ({
  STORE_DIR: '/test/store',
}))

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))

vi.mock('fs', () => mockFs)

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

describe('db', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('initializes database and creates tables', async () => {
    const { initDatabase } = await import('./db.js')
    const db = initDatabase(':memory:')
    expect(db).toBeTruthy()
  })

  it('getDb throws when not initialized', async () => {
    const { getDb } = await import('./db.js')
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('getDb returns the initialized database', async () => {
    const { initDatabase, getDb } = await import('./db.js')
    initDatabase(':memory:')
    expect(getDb()).toBeTruthy()
  })

  describe('hive mind', () => {
    it('inserts and retrieves hive entries', async () => {
      const { initDatabase, insertHiveEntry, getRecentHiveEntries } = await import('./db.js')
      initDatabase(':memory:')
      insertHiveEntry({ id: '1', agent_id: 'agent-1', action: 'test', summary: 'Test entry' })
      insertHiveEntry({ id: '2', agent_id: 'agent-1', action: 'test2', summary: 'Test entry 2' })
      const entries = getRecentHiveEntries(5)
      expect(entries).toHaveLength(2)
    })
  })

  describe('inter-agent tasks', () => {
    it('inserts and queries tasks for agent', async () => {
      const { initDatabase, insertInterAgentTask, getTasksForAgent } = await import('./db.js')
      initDatabase(':memory:')
      insertInterAgentTask({ id: '1', from_agent: 'main', to_agent: 'dev', prompt: 'Do something' })
      const tasks = getTasksForAgent('dev')
      expect(tasks).toHaveLength(1)
    })

    it('returns empty for agent with no tasks', async () => {
      const { initDatabase, getTasksForAgent } = await import('./db.js')
      initDatabase(':memory:')
      expect(getTasksForAgent('nobody')).toHaveLength(0)
    })
  })

  describe('scheduled tasks', () => {
    it('inserts and lists scheduled tasks', async () => {
      const { initDatabase, insertScheduledTask, listScheduledTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      expect(listScheduledTasks()).toHaveLength(1)
    })

    it('filters by agent_id', async () => {
      const { initDatabase, insertScheduledTask, listScheduledTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      insertScheduledTask({ id: '2', agent_id: 'dev', chat_id: 'chat-2', prompt: 'Test 2', schedule: '0 * * * *', next_run: new Date().toISOString() })
      expect(listScheduledTasks('dev')).toHaveLength(1)
    })

    it('marks task as running and updates after run', async () => {
      const { initDatabase, insertScheduledTask, markTaskRunning, updateTaskAfterRun } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      markTaskRunning('1')
      updateTaskAfterRun('1', 'done', new Date(Date.now() + 86400000).toISOString())
    })

    it('pause and resume task', async () => {
      const { initDatabase, insertScheduledTask, pauseTask, resumeTask, listScheduledTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      pauseTask('1')
      resumeTask('1', new Date(Date.now() + 86400000).toISOString())
      const tasks = listScheduledTasks() as Array<{ status: string }>
      expect(tasks[0].status).toBe('active')
    })

    it('deletes a task', async () => {
      const { initDatabase, insertScheduledTask, deleteTask, listScheduledTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      deleteTask('1')
      expect(listScheduledTasks()).toHaveLength(0)
    })

    it('resets stuck running tasks', async () => {
      const { initDatabase, insertScheduledTask, markTaskRunning, resetStuckTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'Test', schedule: '0 * * * *', next_run: new Date().toISOString() })
      markTaskRunning('1')
      resetStuckTasks()
    })

    it('returns 0 failures for unknown task', async () => {
      const { initDatabase, getTaskFailures } = await import('./db.js')
      initDatabase(':memory:')
      expect(getTaskFailures('nonexistent')).toBe(0)
    })
  })

  describe('missions', () => {
    it('inserts, queries, completes, and cancels missions', async () => {
      const { initDatabase, insertMission, listMissions, getNextQueuedMission, completeMission, cancelMission } = await import('./db.js')
      initDatabase(':memory:')
      insertMission({ id: '1', title: 'Test Mission', prompt: 'Do it' })
      insertMission({ id: '2', title: 'Second', prompt: 'Do it too', priority: 1 })
      expect(listMissions()).toHaveLength(2)
      const next = getNextQueuedMission() as any
      expect(next).toBeTruthy()
      completeMission('1', 'done')
      cancelMission('2')
    })
  })

  describe('audit log', () => {
    it('inserts and retrieves audit entries', async () => {
      const { initDatabase, insertAuditEntry, getAuditEntries } = await import('./db.js')
      initDatabase(':memory:')
      insertAuditEntry({ agent_id: 'system', chat_id: 'chat-1', action: 'test', detail: 'Test entry' })
      expect(getAuditEntries()).toHaveLength(1)
    })

    it('filters audit entries by agent', async () => {
      const { initDatabase, insertAuditEntry, getAuditEntries } = await import('./db.js')
      initDatabase(':memory:')
      insertAuditEntry({ agent_id: 'main', chat_id: 'chat-1', action: 'test' })
      insertAuditEntry({ agent_id: 'dev', chat_id: 'chat-1', action: 'test' })
      expect(getAuditEntries('dev')).toHaveLength(1)
    })
  })

  describe('turns', () => {
    it('inserts and retrieves recent turns', async () => {
      const { initDatabase, insertTurn, getRecentTurns } = await import('./db.js')
      initDatabase(':memory:')
      insertTurn('chat-1', 'user', 'hello')
      insertTurn('chat-1', 'assistant', 'hi')
      insertTurn('chat-1', 'user', 'how are you?')
      expect(getRecentTurns('chat-1')).toHaveLength(3)
    })

    it('returns empty for unknown chat', async () => {
      const { initDatabase, getRecentTurns } = await import('./db.js')
      initDatabase(':memory:')
      expect(getRecentTurns('unknown')).toHaveLength(0)
    })

    it('prunes old turns keeping most recent', async () => {
      const { initDatabase, insertTurn, getRecentTurns, pruneOldTurns } = await import('./db.js')
      initDatabase(':memory:')
      for (let i = 0; i < 10; i++) {
        insertTurn('chat-1', 'user', `msg ${i}`)
      }
      pruneOldTurns('chat-1', 'main', 3)
      expect(getRecentTurns('chat-1').length).toBeLessThanOrEqual(3)
    })
  })

  describe('delegation sessions', () => {
    it('creates and queries delegation sessions', async () => {
      const { initDatabase, createDelegationSession, getDelegationSession, updateDelegationSessionStatus } = await import('./db.js')
      initDatabase(':memory:')
      createDelegationSession({ id: 'session-1', chat_id: 'chat-1', user_request: 'Help me' })
      const session = getDelegationSession('session-1') as any
      expect(session).toBeTruthy()
      expect(session.user_request).toBe('Help me')
      updateDelegationSessionStatus('session-1', 'completed')
    })

    it('creates delegated tasks and queries by session', async () => {
      const { initDatabase, delegateTask, getSessionTasks, getPendingTasks, claimTask, completeTask } = await import('./db.js')
      initDatabase(':memory:')
      delegateTask({ id: 'task-1', from_agent: 'main', to_agent: 'dev', prompt: 'Do it', session_id: 'session-1' })
      delegateTask({ id: 'task-2', from_agent: 'main', to_agent: 'dev', prompt: 'Do it 2', session_id: 'session-1' })
      expect(getSessionTasks('session-1')).toHaveLength(2)
      expect(getPendingTasks().length).toBeGreaterThan(0)
      claimTask('task-1')
      completeTask('task-1', 'done')
    })
  })

  describe('meet sessions', () => {
    it('inserts and lists meet sessions', async () => {
      const { initDatabase, insertMeetSession, listMeetSessions, updateMeetSessionStatus, getActiveMeetSessions } = await import('./db.js')
      initDatabase(':memory:')
      insertMeetSession({ id: 'meet-1', agent_id: 'main', meet_url: 'https://meet.google.com/abc', platform: 'google_meet' })
      updateMeetSessionStatus('meet-1', 'active')
      expect(listMeetSessions()).toHaveLength(1)
      expect(getActiveMeetSessions()).toHaveLength(1)
    })
  })

  describe('stubs', () => {
    it('getMemoriesByAgent returns empty array', async () => {
      const { initDatabase, getMemoriesByAgent } = await import('./db.js')
      initDatabase(':memory:')
      expect(getMemoriesByAgent('test')).toEqual([])
    })

    it('runSalienceDecay does not throw', async () => {
      const { initDatabase, runSalienceDecay } = await import('./db.js')
      initDatabase(':memory:')
      expect(() => runSalienceDecay()).not.toThrow()
    })
  })

  describe('listScheduledTasks without filter', () => {
    it('returns all tasks', async () => {
      const { initDatabase, insertScheduledTask, listScheduledTasks } = await import('./db.js')
      initDatabase(':memory:')
      insertScheduledTask({ id: '1', agent_id: 'main', chat_id: 'chat-1', prompt: 'A', schedule: '0 * * * *', next_run: new Date().toISOString() })
      insertScheduledTask({ id: '2', agent_id: 'dev', chat_id: 'chat-2', prompt: 'B', schedule: '0 * * * *', next_run: new Date().toISOString() })
      expect(listScheduledTasks()).toHaveLength(2)
    })
  })

  describe('sessions', () => {
    it('handles getSession on non-existent chat', async () => {
      const { initDatabase, getSession } = await import('./db.js')
      initDatabase(':memory:')
      expect(getSession('nonexistent')).toBeUndefined()
    })

    it('clearSession does not throw on non-existent', async () => {
      const { initDatabase, clearSession } = await import('./db.js')
      initDatabase(':memory:')
      expect(() => clearSession('nonexistent')).not.toThrow()
    })
  })
})
