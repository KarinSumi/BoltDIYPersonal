import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const JOBS_FILE = 'jobs.json'
const STORE_DIR = process.env.STORE_DIR || join(process.cwd(), 'store')

export class JobScheduler {
  constructor(options = {}) {
    this.storeDir = options.storeDir || STORE_DIR
    this.filePath = join(this.storeDir, JOBS_FILE)
    this.jobs = new Map()
    this.timers = new Map()
    this.broadcast = options.broadcast || (() => {})
    this.createTask = options.createTask || (async () => {})
    this.running = false

    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true })
    }

    this._load()
  }

  _load() {
    if (!existsSync(this.filePath)) return
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      if (Array.isArray(data)) {
        for (const job of data) {
          this.jobs.set(job.id, job)
        }
      }
    } catch {}
  }

  _save() {
    const data = Array.from(this.jobs.values()).map(j => ({
      ...j,
      lastRun: j.lastRun,
      nextRun: j.nextRun,
      runCount: j.runCount,
    }))
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  register(title, prompt, schedule, options = {}) {
    if (!title) throw new Error('Job title is required')
    if (!prompt) throw new Error('Job prompt is required')
    if (!schedule || !schedule.type) throw new Error('Schedule type is required')

    const validTypes = ['once', 'interval', 'daily', 'hourly']
    if (!validTypes.includes(schedule.type)) {
      throw new Error(`Invalid schedule type "${schedule.type}". Valid: ${validTypes.join(', ')}`)
    }

    if (schedule.type === 'interval' && (!schedule.intervalMs || schedule.intervalMs < 60000)) {
      throw new Error('Interval jobs require intervalMs >= 60000 (1 minute)')
    }

    const job = {
      id: randomUUID(),
      title,
      prompt,
      schedule: {
        type: schedule.type,
        intervalMs: schedule.intervalMs || null,
        cron: schedule.cron || null,
        startAt: schedule.startAt || null,
      },
      agentId: options.agentId || null,
      taskType: options.taskType || 'nim',
      priority: options.priority || 3,
      status: 'active',
      createdAt: Date.now(),
      lastRun: null,
      nextRun: null,
      runCount: 0,
      lastResult: null,
      lastError: null,
    }

    this.jobs.set(job.id, job)
    this._save()

    this.broadcast('job_registered', {
      id: job.id,
      title: job.title,
      schedule: job.schedule,
      ts: Date.now(),
    })

    if (this.running) {
      this._scheduleJob(job)
    }

    return job
  }

  unregister(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    this._cancelTimer(jobId)
    this.jobs.delete(jobId)
    this._save()

    this.broadcast('job_unregistered', {
      id: jobId,
      title: job.title,
      ts: Date.now(),
    })

    return true
  }

  get(jobId) {
    return this.jobs.get(jobId) || null
  }

  list(filter = {}) {
    let all = Array.from(this.jobs.values())
    if (filter.status) {
      all = all.filter(j => j.status === filter.status)
    }
    if (filter.agentId) {
      all = all.filter(j => j.agentId === filter.agentId)
    }
    return all
  }

  start() {
    if (this.running) return
    this.running = true
    for (const [, job] of this.jobs) {
      if (job.status === 'active') {
        this._scheduleJob(job)
      }
    }
    this.broadcast('scheduler_started', { ts: Date.now() })
  }

  stop() {
    this.running = false
    for (const [jobId] of this.timers) {
      this._cancelTimer(jobId)
    }
    this.broadcast('scheduler_stopped', { ts: Date.now() })
  }

  async runNow(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    return this._executeJob(job)
  }

  pause(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    job.status = 'paused'
    this._cancelTimer(jobId)
    this._save()

    this.broadcast('job_paused', {
      id: jobId,
      title: job.title,
      ts: Date.now(),
    })

    return job
  }

  resume(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)

    job.status = 'active'
    if (this.running) {
      this._scheduleJob(job)
    }
    this._save()

    this.broadcast('job_resumed', {
      id: jobId,
      title: job.title,
      ts: Date.now(),
    })

    return job
  }

  _scheduleJob(job) {
    this._cancelTimer(job.id)

    const schedule = job.schedule
    let delay = 0

    if (schedule.type === 'once') {
      if (schedule.startAt) {
        const startTime = new Date(schedule.startAt).getTime()
        delay = Math.max(0, startTime - Date.now())
      }
      const timer = setTimeout(() => {
        this._executeJob(job)
        job.status = 'completed'
        this._save()
      }, delay)
      this.timers.set(job.id, timer)
      job.nextRun = Date.now() + delay
    } else if (schedule.type === 'interval') {
      const interval = schedule.intervalMs
      const timer = setInterval(() => {
        this._executeJob(job)
      }, interval)
      this.timers.set(job.id, timer)
      job.nextRun = Date.now() + interval
    } else if (schedule.type === 'daily') {
      const timer = setInterval(() => {
        this._executeJob(job)
      }, 24 * 60 * 60 * 1000)
      this.timers.set(job.id, timer)
      job.nextRun = Date.now() + 24 * 60 * 60 * 1000
    } else if (schedule.type === 'hourly') {
      const timer = setInterval(() => {
        this._executeJob(job)
      }, 60 * 60 * 1000)
      this.timers.set(job.id, timer)
      job.nextRun = Date.now() + 60 * 60 * 1000
    }
  }

  _cancelTimer(jobId) {
    const timer = this.timers.get(jobId)
    if (timer) {
      clearInterval(timer)
      clearTimeout(timer)
      this.timers.delete(jobId)
    }
  }

  async _executeJob(job) {
    const runId = randomUUID().slice(0, 8)
    const startTime = Date.now()

    this.broadcast('job_run_started', {
      id: job.id,
      title: job.title,
      runId,
      ts: startTime,
    })

    try {
      const result = await this.createTask({
        title: `[Job] ${job.title} (run ${runId})`,
        prompt: job.prompt,
        taskType: job.taskType,
        agentId: job.agentId,
        priority: job.priority,
      })

      job.lastRun = startTime
      job.runCount++
      job.lastResult = result
      job.lastError = null

      this.broadcast('job_run_completed', {
        id: job.id,
        title: job.title,
        runId,
        result,
        duration: Date.now() - startTime,
        ts: Date.now(),
      })
    } catch (err) {
      job.lastError = err.message

      this.broadcast('job_run_failed', {
        id: job.id,
        title: job.title,
        runId,
        error: err.message,
        duration: Date.now() - startTime,
        ts: Date.now(),
      })
    }

    this._save()
  }
}

export default JobScheduler
