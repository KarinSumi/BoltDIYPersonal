import crypto from 'crypto'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export class AgentSociety {
  constructor(options = {}) {
    this.registry = options.registry
    this.broadcast = options.broadcast
    this.llm = options.llm
    this.interval = options.interval || 60000
    this.proposalRateLimit = options.proposalRateLimit || 3600000
    this.lastProposalTime = 0
    this.idleAgents = new Map()
    this.activeMeetings = new Map()
    this.meetingIdCounter = 0

    if (options.autoStart !== false) {
      this._startTick()
    }
  }

  _startTick() {
    this._tickInterval = setInterval(() => this._tick(), this.interval)
  }

  stop() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval)
      this._tickInterval = null
    }
  }

  async _tick() {
    const agents = this.registry.list()
    const idle = agents.filter(a => a.status === 'idle' || !a.status)

    if (idle.length < 2) return

    const shuffled = idle.sort(() => Math.random() - 0.5)
    const pair = shuffled.slice(0, 2)

    const commonRooms = ['cafeteria', 'recreation', 'lobby']
    const room = commonRooms[Math.floor(Math.random() * commonRooms.length)]

    this.broadcast('agent_idle_chat', {
      agents: pair.map(a => ({ id: a.id, name: a.name })),
      room,
      ts: Date.now(),
    })

    if (this.llm && pair.length === 2) {
      try {
        const chatPrompt = `You are ${pair[0].name} (${pair[0].role || 'team member'}) and ${pair[1].name} (${pair[1].role || 'team member'}). You meet in the ${room} during a break. Generate a short, natural chat between them about their current work or ideas. Format as:\n${pair[0].name}: <text>\n${pair[1].name}: <text>`
        const chatResult = await this.llm(chatPrompt)
        this.broadcast('idle_chat_generated', {
          agents: pair.map(a => ({ id: a.id, name: a.name })),
          room,
          transcript: chatResult,
          ts: Date.now(),
        })
      } catch (err) {
        this.broadcast('idle_chat_generated', {
          agents: pair.map(a => ({ id: a.id, name: a.name })),
          room,
          transcript: `${pair[0].name}: Hey ${pair[1].name}, how's your project going?\n${pair[1].name}: Going well! Just wrapping up the latest iteration.`,
          ts: Date.now(),
          error: err.message,
        })
      }
    }

    const shouldPropose = this.llm
      ? Math.random() < 0.15 && (Date.now() - this.lastProposalTime) > this.proposalRateLimit
      : Math.random() < 0.1 && (Date.now() - this.lastProposalTime) > this.proposalRateLimit

    if (shouldPropose && pair.length === 2) {
      this.lastProposalTime = Date.now()
      let title = `Auto-generated: ${pair.map(a => a.name).join(' & ')} collaboration`
      let description = `Proposed by ${pair[0].name} and ${pair[1].name} during idle chat in ${room}`

      if (this.llm) {
        try {
          const proposalPrompt = `You are an AI that generates project ideas. Two team members (${pair[0].name} and ${pair[1].name}) are chatting in the ${room}. Generate a realistic project proposal title and description that would make sense for an AI agent office. Respond as JSON: {"title": "...", "description": "..."}`
          const proposalResult = await this.llm(proposalPrompt)
          const parsed = JSON.parse(proposalResult)
          if (parsed.title) title = parsed.title
          if (parsed.description) description = parsed.description
        } catch {}
      }

      const proposal = {
        id: crypto.randomUUID(),
        type: 'project_proposal',
        title,
        description,
        proposedBy: pair.map(a => a.id),
        room,
        ts: Date.now(),
        status: 'pending',
      }

      this.broadcast('project_proposal', proposal)
    }
  }

  async startMeeting(topic, agentIds, options = {}) {
    if (agentIds.length < 2 || agentIds.length > 4) {
      throw new Error('Meetings require 2-4 agents')
    }

    const agents = agentIds.map(id => this.registry.get(id)).filter(Boolean)
    if (agents.length < 2) {
      throw new Error('One or more agents not found')
    }

    const meetingId = `meeting-${++this.meetingIdCounter}`
    const meeting = {
      id: meetingId,
      topic,
      agents: agents.map(a => ({ id: a.id, name: a.name, role: a.role })),
      transcript: [],
      status: 'in_progress',
      startedAt: Date.now(),
      round: 0,
      maxRounds: options.maxRounds || 3,
    }

    this.activeMeetings.set(meetingId, meeting)

    this.broadcast('meeting_started', {
      id: meetingId,
      topic,
      agents: meeting.agents,
    })

    for (let round = 0; round < meeting.maxRounds; round++) {
      meeting.round = round + 1
      for (const agent of agents) {
        let contribution
        if (this.llm) {
          try {
            const transcriptSoFar = meeting.transcript
              .map(t => `[${t.agentName}]: ${t.text}`)
              .join('\n')
            const context = transcriptSoFar
              ? `Here is what has been said so far:\n${transcriptSoFar}\n\n`
              : ''
            const prompt = `You are ${agent.name} (${agent.role || 'team member'}) in a meeting about "${topic}". ${context}Provide your contribution to this meeting as ${agent.name}. Be concise and professional.`
            contribution = await this.llm(prompt)
          } catch {
            contribution = `[${agent.name} was unable to contribute]`
          }
        } else {
          contribution = `[${agent.name}]: Notes on "${topic}" - round ${round + 1}`
        }
        meeting.transcript.push({
          agentId: agent.id,
          agentName: agent.name,
          text: contribution,
          round: round + 1,
          ts: Date.now(),
        })
        if (this.llm) {
          await sleep(500)
        }
      }
    }

    meeting.status = 'completed'
    meeting.endedAt = Date.now()

    const minutes = this._generateMinutes(meeting)
    meeting.minutes = minutes

    this.broadcast('meeting_minutes', {
      id: meetingId,
      topic,
      agents: meeting.agents,
      minutes,
      transcript: meeting.transcript,
      duration: meeting.endedAt - meeting.startedAt,
    })

    return meeting
  }

  _generateMinutes(meeting) {
    return {
      summary: `Meeting on "${meeting.topic}" with ${meeting.agents.length} agents across ${meeting.maxRounds} rounds.`,
      participants: meeting.agents,
      keyPoints: [
        `Discussed ${meeting.topic}`,
        `${meeting.agents.length} agents participated`,
        `${meeting.maxRounds} rounds completed`,
      ],
      nextSteps: [`Follow up on ${meeting.topic}`],
    }
  }

  getMeeting(id) {
    return this.activeMeetings.get(id) || null
  }

  listMeetings() {
    return Array.from(this.activeMeetings.values())
  }
}
