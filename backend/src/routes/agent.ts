import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createAgent, validAgentTypes } from '../agents/index.js'
import { splitScriptIntoStoryboardChunks } from '../agents/storyboard-chunks.js'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import {
  normalizeAgentResult,
  wasToolUsed,
  type NormalizedToolCall,
  type NormalizedToolResult,
} from '../agents/result-normalizer.js'

const app = new Hono()

async function runChunkedStoryboardBreaker(
  message: string,
  dramaId: number,
  episodeId: number,
  chunkChars?: number,
) {
  const [episode] = (await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId)).all())
  if (!episode) throw new Error('Episode not found')

  const script = episode.scriptContent || episode.content || ''
  if (!script.trim()) throw new Error('Episode has no script')

  const maxChars = chunkChars || 1800
  const chunks = splitScriptIntoStoryboardChunks(script, { maxChars })
  if (!chunks.length) throw new Error('Episode script cannot be split into storyboard chunks')

  logTaskProgress('Agent', 'storyboard-chunks-prepared', {
    episodeId,
    chunks: chunks.length,
    chunkChars: maxChars,
  })

  const chunkResults: Array<{
    chunkIndex: number
    chunkTotal: number
    chunkLength: number
    text: string
    toolCalls: NormalizedToolCall[]
    toolResults: NormalizedToolResult[]
  }> = []
  const allToolCalls: NormalizedToolCall[] = []
  const allToolResults: NormalizedToolResult[] = []

  for (const chunk of chunks) {
    logTaskProgress('Agent', 'storyboard-chunk-start', {
      episodeId,
      chunkIndex: chunk.index,
      chunkTotal: chunk.total,
      chunkLength: chunk.script.length,
    })

    const chunkAgent = await createAgent('storyboard_breaker', episodeId, dramaId, {
      storyboard: {
        scriptChunk: chunk,
        appendMode: true,
        clearBeforeAppend: chunk.index === 1,
      },
    })
    if (!chunkAgent) throw new Error('Agent not found')

    const chunkMessage = [
      message,
      `This is storyboard chunk ${chunk.index}/${chunk.total}.`,
      'Only process the script returned by read_storyboard_context for this chunk. Do not invent or cover other chunks.',
      'Required workflow: call read_storyboard_context first, then call append_storyboards to save only this chunk.',
      'Do not call save_storyboards. Temporary shot_number values may start at 1; append_storyboards will continue the real numbering.',
      'Generate at least 1 shot for this chunk, including an empty/environment shot when the chunk is transitional.',
    ].join('\n\n')

    const result = await chunkAgent.generate(
      [{ role: 'user', content: chunkMessage }],
      { maxSteps: 12 },
    )
    const normalized = normalizeAgentResult(result)
    const chunkToolNames = normalized.toolCalls.map((toolCall) => toolCall.toolName)

    allToolCalls.push(...normalized.toolCalls)
    allToolResults.push(...normalized.toolResults)
    chunkResults.push({
      chunkIndex: chunk.index,
      chunkTotal: chunk.total,
      chunkLength: chunk.script.length,
      text: normalized.text,
      toolCalls: normalized.toolCalls,
      toolResults: normalized.toolResults,
    })

    logTaskProgress('Agent', 'storyboard-chunk-tools', {
      episodeId,
      chunkIndex: chunk.index,
      toolCalls: chunkToolNames,
    })

    if (!wasToolUsed(normalized, 'append_storyboards')) {
      throw new Error(`Storyboard chunk ${chunk.index}/${chunk.total} did not call append_storyboards`)
    }
  }

  return {
    type: 'done',
    text: chunkResults.map((item) => item.text).filter(Boolean).join('\n\n'),
    toolCalls: allToolCalls,
    toolResults: allToolResults,
    chunks: chunkResults,
  }
}

app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  logTaskStart('Agent', agentType, {
    dramaId: drama_id,
    episodeId: episode_id,
    message,
  })
  logTaskPayload('Agent', `${agentType} input`, body)

  if (!episode_id || !drama_id) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, 'drama_id and episode_id are required')
  }

  const dramaId = Number(drama_id)
  const episodeId = Number(episode_id)
  const startTime = performance.now()

  try {
    if (agentType === 'storyboard_breaker') {
      const data = await runChunkedStoryboardBreaker(
        String(message || ''),
        dramaId,
        episodeId,
        Number(body.storyboard_chunk_chars || 0) || undefined,
      )

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      logTaskSuccess('Agent', agentType, {
        elapsedSeconds: elapsed,
        chunks: data.chunks.length,
      })
      logTaskProgress('Agent', 'tool-summary', {
        agentType,
        toolCalls: data.toolCalls.map((tc) => tc.toolName),
        toolResults: data.toolResults.map((tr) => tr.toolName),
      })
      logTaskPayload('Agent', `${agentType} tool-results`, data.toolResults)

      return success(c, data)
    }

    const agent = await createAgent(agentType, episodeId, dramaId)
    if (!agent) {
      logTaskError('Agent', agentType, { reason: 'agent not found' })
      return badRequest(c, 'Agent not found')
    }

    const result = await agent.generate(
      [{ role: 'user', content: message }],
      { maxSteps: 20 },
    )
    const normalized = normalizeAgentResult(result)

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsed })
    logTaskProgress('Agent', 'tool-summary', {
      agentType,
      toolCalls: normalized.toolCalls.map((tc) => tc.toolName),
      toolResults: normalized.toolResults.map((tr) => tr.toolName),
    })
    logTaskPayload('Agent', `${agentType} tool-results`, normalized.toolResults)

    return success(c, {
      type: 'done',
      text: normalized.text,
      toolCalls: normalized.toolCalls,
      toolResults: normalized.toolResults,
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: err.message })
    console.error(err.stack || err)
    return badRequest(c, err.message || 'Agent execution failed')
  }
})

app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app
