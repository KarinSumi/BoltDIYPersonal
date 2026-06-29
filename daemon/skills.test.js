import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'
import { SkillsLibrary } from './skills.js'

describe('SkillsLibrary', () => {
  let baseDir, skills

  beforeEach(() => {
    const id = crypto.randomUUID()
    baseDir = join(tmpdir(), `skills-test-${id}`)
    mkdirSync(baseDir, { recursive: true })
    skills = new SkillsLibrary({ baseDir })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('loads 11 built-in skills', () => {
    const list = skills.list()
    expect(list.length).toBe(11)
  })

  it('finds skill by id', () => {
    const s = skills.get('code-review')
    expect(s).not.toBeNull()
    expect(s.description).toContain('code')
  })

  it('returns null for unknown skill', () => {
    expect(skills.get('nonexistent')).toBeNull()
  })

  it('learns new skills', async () => {
    const skill = await skills.learn('API Design', 'Use RESTful principles for API design. Follow OpenAPI 3.0 spec. Document all endpoints.')
    expect(skill.id).toBe('api-design')
    expect(skill.builtin).toBe(false)
  })

  it('matches relevant skills to task', () => {
    const relevant = skills.getRelevant('I need to review a pull request for bugs')
    expect(relevant.length).toBeGreaterThanOrEqual(1)
    expect(relevant.some(r => r.id === 'code-review')).toBe(true)
  })

  it('loads custom skills from files', () => {
    writeFileSync(join(baseDir, 'custom-test.json'), JSON.stringify({
      id: 'custom-skill',
      name: 'Custom Skill',
      description: 'A custom learned skill',
      instructions: 'Do things custom way',
    }))
    const s = new SkillsLibrary({ baseDir })
    expect(s.get('custom-skill')).not.toBeNull()
  })

  it('builtin skills have instructions', () => {
    for (const s of skills.list()) {
      const full = skills.get(s.id)
      expect(full.instructions).toBeTruthy()
    }
  })

  it('reflectAndLearn extracts skill via LLM', async () => {
    const llm = async () => JSON.stringify({
      shouldLearn: true,
      name: 'Test Skill',
      description: 'A test skill',
      instructions: 'Do the test thing',
    })
    const s = new SkillsLibrary({ baseDir: skills.baseDir, llm })
    const result = await s.reflectAndLearn('test task', 'some steps')
    expect(result.learned).toBe(true)
    expect(result.skill).not.toBeNull()
    expect(result.skill.name).toBe('Test Skill')
    expect(result.reason).toBe('extracted by LLM')
  })

  it('reflectAndLearn returns not-learned when LLM says no', async () => {
    const llm = async () => JSON.stringify({ shouldLearn: false })
    const s = new SkillsLibrary({ baseDir: skills.baseDir, llm })
    const result = await s.reflectAndLearn('test task', 'some steps')
    expect(result.learned).toBe(false)
    expect(result.skill).toBeNull()
    expect(result.reason).toBe('LLM determined no reusable skill')
  })

  it('getRelevantInstructions returns formatted string', () => {
    const formatted = skills.getRelevantInstructions('I need to review a pull request for bugs')
    expect(formatted).toContain('## Relevant Skills')
    expect(formatted).toContain('Code Review')
    expect(formatted).toContain('You review code')
  })

  it('reflectAndLearn respects cooldown', async () => {
    const llm = async () => JSON.stringify({
      shouldLearn: true,
      name: 'Cooldown Skill',
      description: '',
      instructions: 'cool down',
    })
    const s = new SkillsLibrary({ baseDir: skills.baseDir, llm, autoLearnCooldown: 60000 })
    const first = await s.reflectAndLearn('task', 'steps')
    expect(first.learned).toBe(true)
    const second = await s.reflectAndLearn('task', 'steps')
    expect(second.learned).toBe(false)
    expect(second.reason).toBe('cooldown active')
    expect(second.skill).toBeNull()
  })
})
