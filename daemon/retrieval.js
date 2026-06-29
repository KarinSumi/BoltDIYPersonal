import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

export class BM25 {
  constructor(options = {}) {
    this.k1 = options.k1 ?? 1.5
    this.b = options.b ?? 0.75
    this.documents = []
    this.docLengths = []
    this.avgDocLength = 0
    this.termFreqs = new Map()
    this.docCount = 0
    this.vocab = new Set()
  }

  indexDocuments(docs) {
    this.documents = docs
    this.docLengths = docs.map(d => this._tokenize(d).length)
    this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / this.documents.length || 1
    this.termFreqs.clear()
    this.vocab.clear()
    this.docCount = docs.length

    for (let i = 0; i < docs.length; i++) {
      const tokens = this._tokenize(docs[i])
      const freq = {}
      for (const t of tokens) {
        this.vocab.add(t)
        freq[t] = (freq[t] || 0) + 1
      }
      for (const [term, count] of Object.entries(freq)) {
        if (!this.termFreqs.has(term)) this.termFreqs.set(term, new Map())
        this.termFreqs.get(term).set(i, count)
      }
    }
  }

  search(query, topN = 5) {
    const tokens = this._tokenize(query)
    const scores = new Array(this.docCount).fill(0)

    for (const term of tokens) {
      const df = this.termFreqs.get(term)?.size || 0
      if (df === 0) continue

      const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5))

      for (let i = 0; i < this.docCount; i++) {
        const tf = this.termFreqs.get(term)?.get(i) || 0
        if (tf === 0) continue

        const numerator = tf * (this.k1 + 1)
        const denominator = tf + this.k1 * (1 - this.b + this.b * this.docLengths[i] / this.avgDocLength)
        scores[i] += idf * numerator / denominator
      }
    }

    const indexed = scores.map((score, i) => ({ index: i, score, text: this.documents[i] }))
    indexed.sort((a, b) => b.score - a.score)
    return indexed.slice(0, topN).filter(r => r.score > 0)
  }

  _tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s\u0E00-\u0E7F]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  }
}

export class MemoryStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || join(process.cwd(), 'workspace')
    this.memoryDir = join(this.baseDir, 'memory')
    this.sharedPath = join(this.baseDir, 'OFFICE.md')
    this.bm25 = new BM25()
    this.entries = []

    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true })
    }

    this._loadAll()
  }

  _loadAll() {
    this.entries = []

    if (existsSync(this.sharedPath)) {
      this.entries.push({
        id: 'shared',
        text: readFileSync(this.sharedPath, 'utf-8'),
        type: 'shared',
        path: this.sharedPath,
      })
    }

    if (existsSync(this.memoryDir)) {
      const files = readdirSync(this.memoryDir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        const content = readFileSync(join(this.memoryDir, file), 'utf-8')
        this.entries.push({
          id: file.replace('.md', ''),
          text: content,
          type: 'agent',
          path: join(this.memoryDir, file),
        })
      }
    }

    this.bm25.indexDocuments(this.entries.map(e => e.text))
  }

  store(id, text, options = {}) {
    const type = options.type || 'agent'
    let filePath

    if (type === 'shared') {
      filePath = this.sharedPath
    } else {
      filePath = join(this.memoryDir, `${id}.md`)
    }

    writeFileSync(filePath, text, 'utf-8')

    const existing = this.entries.findIndex(e => e.id === id && e.type === type)
    const entry = { id, text, type, path: filePath }

    if (existing >= 0) {
      this.entries[existing] = entry
    } else {
      this.entries.push(entry)
    }

    this.bm25.indexDocuments(this.entries.map(e => e.text))

    return entry
  }

  query(queryText, topN = 5) {
    const results = this.bm25.search(queryText, topN)
    return results.map(r => ({
      ...this.entries[r.index],
      score: r.score,
      relevance: r.score > 1 ? 'high' : r.score > 0.5 ? 'medium' : 'low',
    }))
  }

  get(id) {
    return this.entries.find(e => e.id === id) || null
  }

  list() {
    return this.entries.map(e => ({ id: e.id, type: e.type, path: e.path }))
  }
}
