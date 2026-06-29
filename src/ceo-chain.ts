import { queryAgent, AgentMessage } from './opencode-agent.js'
import { createKanbanBoard, createKanbanTask, getKanbanTask, setKanbanTaskStatus, getBoardProgress } from './orchestrator.js'
import { logger } from './logger.js'

export interface CeoOrder {
  order: string
  boardId: string
  tasks: CeoSubTask[]
  status: 'decomposing' | 'dispatching' | 'collecting' | 'done' | 'failed'
}

export interface CeoSubTask {
  title: string
  agentId: string
  prompt: string
  taskId?: string
  result?: string
  status: 'pending' | 'running' | 'done' | 'failed'
}

export async function handleCeoOrder(userMessage: string, chatId: string): Promise<{
  plan: string
  summary: string
  boardId: string
}> {
  const boardId = createKanbanBoard(
    `CEO Order: ${userMessage.slice(0, 80)}`,
    `CEO chain of command for: ${userMessage}`,
    1,
    chatId
  )

  const decompositionResult = await queryAgent({
    messages: [{ role: 'user', content: `Decompose the following CEO order into 2-4 sub-tasks that can be executed by specialist agents. Available agents: dev (code), research (research), sysops (system ops), writer (docs). For each sub-task, specify: title, which agent should do it, and a clear prompt.

CEO Order: "${userMessage}"

Respond as JSON array:
[
  {
    "title": "short task title",
    "agentId": "dev|research|sysops|writer",
    "prompt": "detailed instructions for the agent"
  }
]` }],
    systemPrompt: 'You are the Director, decomposing CEO orders into actionable sub-tasks. Respond only with valid JSON.',
    maxTurns: 1,
    tools: [],
  })

  let tasks: Array<{ title: string; agentId: string; prompt: string }> = []
  try {
    const parsed = JSON.parse(decompositionResult.text || '[]')
    if (Array.isArray(parsed) && parsed.length > 0) {
      tasks = parsed.slice(0, 4)
    }
  } catch {
    tasks = [{ title: 'Execute order', agentId: 'dev', prompt: userMessage }]
  }

  const taskIds: string[] = []
  for (let i = 0; i < tasks.length; i++) {
    const dependsOn = i > 0 ? JSON.stringify([taskIds[i - 1]]) : undefined
    const taskType = tasks[i].agentId === 'research' || tasks[i].agentId === 'writer' ? 'nim' : 'opencode'
    const taskId = createKanbanTask(boardId, tasks[i].title, tasks[i].prompt, tasks[i].agentId, 1, dependsOn, taskType)
    taskIds.push(taskId)
  }

  const plan = tasks.map((t, i) => `${i + 1}. **${t.title}** → @${t.agentId}`).join('\n')

  return {
    plan,
    summary: `Decomposed into ${tasks.length} tasks. Starting execution.`,
    boardId,
  }
}
