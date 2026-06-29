import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { STORE_DIR } from './config.js'

const MEMORY_DIR = join(STORE_DIR, 'memory')
const GOOD_FILE = join(MEMORY_DIR, 'good.md')
const BAD_FILE = join(MEMORY_DIR, 'bad.md')

function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

export function getMemoryContext(): string {
  ensureMemoryDir()
  let context = ''
  
  if (existsSync(GOOD_FILE)) {
    const goodContent = readFileSync(GOOD_FILE, 'utf-8').trim()
    if (goodContent) {
      context += `\n## Good Behaviors (Learn from these successes)\n${goodContent}\n`
    }
  }

  if (existsSync(BAD_FILE)) {
    const badContent = readFileSync(BAD_FILE, 'utf-8').trim()
    if (badContent) {
      context += `\n## Bad Behaviors (Avoid these mistakes)\n${badContent}\n`
    }
  }

  return context
}

export function addGoodMemory(summary: string): void {
  ensureMemoryDir()
  const timestamp = new Date().toISOString()
  const entry = `- [${timestamp}] ${summary}\n`
  let content = ''
  if (existsSync(GOOD_FILE)) {
    content = readFileSync(GOOD_FILE, 'utf-8')
  }
  writeFileSync(GOOD_FILE, content + entry, 'utf-8')
}

export function addBadMemory(summary: string): void {
  ensureMemoryDir()
  const timestamp = new Date().toISOString()
  const entry = `- [${timestamp}] ${summary}\n`
  let content = ''
  if (existsSync(BAD_FILE)) {
    content = readFileSync(BAD_FILE, 'utf-8')
  }
  writeFileSync(BAD_FILE, content + entry, 'utf-8')
}
