import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const BUILTIN_SKILLS = {
  'office-ops': 'General office operations, scheduling, and coordination',
  'deep-research': 'In-depth research with web search and source aggregation',
  'office-control': 'Office system control and configuration',
  'plugin-builder': 'Build and maintain plugins for the OpenCode OS ecosystem',
  'code-review': 'Review code for bugs, style, and best practices',
  'doc-writer': 'Write clear, comprehensive documentation',
  'debug-detective': 'Systematic debugging and root cause analysis',
  'data-wrangler': 'Data processing, transformation, and analysis',
  'project-kickoff': 'Project initiation and requirements gathering',
  'diagram-maker': 'Create diagrams and visualizations',
  'archive-search': 'Search archived conversations and historical data',
}

export class SkillsLibrary {
  constructor(options = {}) {
    this.baseDir = options.baseDir || join(process.cwd(), 'skills')
    this.skills = new Map()
    this.llm = options.llm || null
    this.autoLearnCooldown = options.autoLearnCooldown || 300000
    this.lastLearnTime = 0

    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true })
    }

    this._loadBuiltins()
    this._loadCustom()
  }

  _loadBuiltins() {
    for (const [id, description] of Object.entries(BUILTIN_SKILLS)) {
      this.skills.set(id, {
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description,
        builtin: true,
        instructions: this._getBuiltinInstructions(id),
      })
    }
  }

  _getBuiltinInstructions(id) {
    const instructions = {
      'office-ops': 'You manage office operations. When asked about scheduling, availability, or coordination, check the registry and propose plans.',
      'deep-research': 'You conduct deep research. Break down questions, search systematically, aggregate findings, and cite sources.',
      'office-control': 'You control office systems. You can restart services, check status, and manage configuration.',
      'plugin-builder': 'You build plugins. Follow the plugin API: export panels, routes, commands, onStart, onStop.',
      'code-review': 'You review code. Check for bugs, security issues, performance problems, and style violations. Be specific.',
      'doc-writer': 'You write documentation. Be clear, complete, and well-structured. Include examples.',
      'debug-detective': 'You debug systematically. Reproduce, isolate, hypothesize, test, fix, verify.',
      'data-wrangler': 'You process data. Clean, transform, analyze, and visualize. Handle edge cases.',
      'project-kickoff': 'You initiate projects. Gather requirements, define scope, identify stakeholders, set milestones.',
      'diagram-maker': 'You create diagrams. Use Mermaid or ASCII art for architecture, flowcharts, and sequence diagrams.',
      'archive-search': 'You search archives. Find relevant past conversations, decisions, and context.',
    }
    return instructions[id] || `You are skilled at ${id.replace(/-/g, ' ')}.`
  }

  _loadCustom() {
    if (!existsSync(this.baseDir)) return
    const files = readdirSync(this.baseDir).filter(f => f.endsWith('.json') || f.endsWith('.md'))

    for (const file of files) {
      try {
        let content
        if (file.endsWith('.json')) {
          const data = JSON.parse(readFileSync(join(this.baseDir, file), 'utf-8'))
          content = data
          this.skills.set(content.id || file.replace('.json', ''), {
            id: content.id || file.replace('.json', ''),
            name: content.name || file.replace('.json', ''),
            description: content.description || '',
            builtin: false,
            instructions: content.instructions || content.prompt || '',
            source: file,
          })
        } else if (file.endsWith('.md')) {
          const id = file.replace('.md', '')
          this.skills.set(id, {
            id,
            name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: 'Custom learned skill',
            builtin: false,
            instructions: readFileSync(join(this.baseDir, file), 'utf-8'),
            source: file,
          })
        }
      } catch {}
    }
  }

  get(id) {
    return this.skills.get(id) || null
  }

  list() {
    return Array.from(this.skills.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      builtin: s.builtin,
    }))
  }

  async learn(name, transcript, options = {}) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const instructions = this._extractInstructions(transcript)

    const skill = {
      id,
      name,
      description: options.description || `Auto-learned: ${name}`,
      builtin: false,
      instructions,
      source: `${id}.md`,
      learnedAt: Date.now(),
      fromAgent: options.agentId || null,
    }

    writeFileSync(join(this.baseDir, `${id}.md`), instructions, 'utf-8')
    this.skills.set(id, skill)

    return skill
  }

  async reflectAndLearn(taskDescription, transcript, options = {}) {
    const now = Date.now()
    if (now - this.lastLearnTime < this.autoLearnCooldown) {
      return { learned: false, skill: null, reason: 'cooldown active' }
    }

    if (this.llm) {
      const prompt = `Given this task and the steps taken, is there a reusable skill or procedure that could be extracted? If so, provide a name, short description, and the reusable instructions. Respond as JSON: { "shouldLearn": boolean, "name": string, "description": string, "instructions": string }

Task: ${taskDescription}

Steps taken:
${transcript}`
      const response = await this.llm(prompt)
      try {
        const parsed = JSON.parse(response)
        if (parsed.shouldLearn && parsed.name && parsed.instructions) {
          const skill = await this.learn(parsed.name, parsed.instructions, {
            description: parsed.description || `Auto-learned: ${parsed.name}`,
            ...options,
          })
          this.lastLearnTime = Date.now()
          return { learned: true, skill, reason: 'extracted by LLM' }
        }
        return { learned: false, skill: null, reason: 'LLM determined no reusable skill' }
      } catch {
        return { learned: false, skill: null, reason: 'failed to parse LLM response' }
      }
    }

    const toolCalls = transcript.split('\n').filter(l =>
      /\b(bash|write_file|read|edit|grep|glob|websearch|webfetch)\b/i.test(l) ||
      /^[a-z]+\s+.+/i.test(l.trim())
    )

    if (toolCalls.length < 3) {
      return { learned: false, skill: null, reason: 'not enough tool calls to extract pattern' }
    }

    const instructions = toolCalls.join('\n')
    const skill = await this.learn(
      options.name || `Heuristic: ${taskDescription.slice(0, 40)}`,
      instructions,
      { description: options.description || `Auto-learned from task: ${taskDescription.slice(0, 80)}`, ...options }
    )
    this.lastLearnTime = Date.now()
    return { learned: true, skill, reason: 'extracted heuristically from tool calls' }
  }

  getRelevantInstructions(taskDescription) {
    const relevant = this.getRelevant(taskDescription)
    if (relevant.length === 0) return ''
    const lines = relevant.map(s => `${s.name}: ${s.instructions}`)
    return `## Relevant Skills\n${lines.join('\n')}`
  }

  _extractInstructions(transcript) {
    const lines = transcript.split('\n').filter(Boolean)
    const instructions = []

    for (const line of lines) {
      if (line.includes('tool') || line.includes('function') || line.includes('command')) {
        instructions.push(line.trim())
      }
    }

    return instructions.length > 0
      ? instructions.join('\n')
      : `Procedure learned from task:\n${transcript.slice(0, 2000)}`
  }

  getRelevant(taskDescription) {
    const taskLower = taskDescription.toLowerCase()
    const relevant = []

    for (const [, skill] of this.skills) {
      const matchScore = this._matchSkill(skill, taskLower)
      if (matchScore > 0) {
        relevant.push({ skill: skill.id, score: matchScore })
      }
    }

    relevant.sort((a, b) => b.score - a.score)
    return relevant.slice(0, 3).map(r => this.skills.get(r.skill))
  }

  _matchSkill(skill, taskLower) {
    const keywords = {
      'office-ops': ['schedule', 'meeting', 'coordinate', 'plan', 'organize'],
      'deep-research': ['research', 'search', 'find', 'investigate', 'explore'],
      'code-review': ['review', 'code', 'bug', 'pull request', 'pr'],
      'doc-writer': ['document', 'write up', 'readme', 'guide'],
      'debug-detective': ['debug', 'fix', 'issue', 'error', 'crash', 'broken'],
      'plugin-builder': ['plugin', 'extension', 'addon'],
      'project-kickoff': ['project', 'init', 'kickoff', 'start'],
      'data-wrangler': ['data', 'csv', 'json', 'transform', 'analyze', 'report'],
      'diagram-maker': ['diagram', 'chart', 'flow', 'visualize'],
      'archive-search': ['history', 'past', 'previous', 'archive', 'old'],
    }

    const terms = keywords[skill.id] || []
    return terms.filter(t => taskLower.includes(t)).length
  }
}
