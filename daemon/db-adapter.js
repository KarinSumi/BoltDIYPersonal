/**
 * In-memory data store for dashboard routes.
 * Provides the same API shapes as the old src/db.ts + src/events.ts + src/kanban-db.ts,
 * but works in plain JS without SQLite.
 */
export class MemStore {
  constructor() {
    /** @type {Array<{timestamp: number, event: string, summary: string}>} */
    this.activities = []
    /** @type {number} */
    this.maxActivity = 100
  }

  /**
   * Push an activity entry into the ring buffer.
   * @param {string} event
   * @param {string} summary
   * @param {number} [timestamp]
   */
  pushActivity(event, summary, timestamp) {
    timestamp = timestamp || Date.now()
    this.activities.push({ timestamp, event, summary })
    if (this.activities.length > this.maxActivity) this.activities.shift()
  }

  /**
   * Return the most recent activity entries, newest first.
   * @param {number} [limit=50]
   * @returns {Array<{timestamp: number, event: string, summary: string}>}
   */
  getRecentActivity(limit = 50) {
    return this.activities.slice(-limit).reverse()
  }

  /** @returns {Array<*>} */
  getMemories() { return [] }
  /** @returns {Array<*>} */
  getHiveEntries() { return [] }
  /** @returns {Array<*>} */
  getAuditEntries() { return [] }
  /** @returns {Array<*>} */
  listScheduledTasks() { return [] }
  /** @returns {Array<*>} */
  listMissions() { return [] }
  /** @returns {Array<*>} */
  listBoards() { return [] }
  /**
   * @param {string} id
   * @returns {object|null}
   */
  getBoard(id) { return null }
  /**
   * @param {string} boardId
   * @returns {Array<*>}
   */
  listTasks(boardId) { return [] }
}
