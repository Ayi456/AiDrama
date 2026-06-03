import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createAgent, isValidAgentType } from '../../agents/index.js'
import { runDirectAgentIfNeeded } from '../../agents/direct-mode.js'
import { splitScriptIntoStoryboardChunks, type StoryboardChunk } from '../../agents/storyboard-chunks.js'
import { db, schema } from '../../db/index.js'
import { success, badRequest } from '../../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import {
  normalizeAgentResult,
  wasToolUsed,
  type NormalizedToolCall,
  type NormalizedToolResult,
} from '../../agents/result-normalizer.js'

const app = new Hono()

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined
}

export const DEFAULT_EXTRACTOR_MESSAGE = '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并。'
export const DEFAULT_STORYBOARD_BREAKER_MESSAGE = '请拆解分镜并生成视频提示词。'

export type StoryboardBreakerProgress = {
  current: number
  total: number
  chunkIndex?: number
}

type StoryboardBreakerOptions = {
  onProgress?: (progress: StoryboardBreakerProgress) => void | Promise<void>
}

export async function runExtractorAgent(
  dramaId: number,
  episodeId: number,
  message: string = DEFAULT_EXTRACTOR_MESSAGE,
) {
  const directResult = await runDirectAgentIfNeeded('extractor', {
    dramaId,
    episodeId,
    message,
  })
  if (directResult) return directResult

  const agent = await createAgent('extractor', episodeId, dramaId)
  if (!agent) throw new Error('Agent not found')

  const result = await agent.generate(
    [{ role: 'user', content: message }],
    { maxSteps: 20 },
  )
  const normalized = normalizeAgentResult(result)
  return {
    type: 'done' as const,
    text: normalized.text,
    toolCalls: normalized.toolCalls,
    toolResults: normalized.toolResults,
  }
}

type StoryboardChunkResult = {
  chunkIndex: number
  chunkTotal: number
  chunkLength: number
  text: string
  toolCalls: NormalizedToolCall[]
  toolResults: NormalizedToolResult[]
}

// 按集脚本切分分镜 chunk。切分是确定性的：同一脚本与 chunkChars 总是得到相同结果，
// 因此前端可以先取总数，再逐 chunk 调用，每次请求都远低于 SCF 900s 上限。
export async function getStoryboardChunks(episodeId: number, chunkChars?: number) {
  const [episode] = (await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId)).all())
  if (!episode) throw new Error('Episode not found')

  const script = episode.scriptContent || episode.content || ''
  if (!script.trim()) throw new Error('Episode has no script')

  const maxChars = chunkChars || 1800
  const chunks = splitScriptIntoStoryboardChunks(script, { maxChars })
  if (!chunks.length) throw new Error('Episode script cannot be split into storyboard chunks')

  return { chunks, maxChars }
}

export async function runStoryboardChunk(
  dramaId: number,
  episodeId: number,
  chunk: StoryboardChunk,
  message: string = DEFAULT_STORYBOARD_BREAKER_MESSAGE,
): Promise<StoryboardChunkResult> {
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

  logTaskProgress('Agent', 'storyboard-chunk-tools', {
    episodeId,
    chunkIndex: chunk.index,
    toolCalls: normalized.toolCalls.map((toolCall) => toolCall.toolName),
  })

  if (!wasToolUsed(normalized, 'append_storyboards')) {
    throw new Error(`Storyboard chunk ${chunk.index}/${chunk.total} did not call append_storyboards`)
  }

  return {
    chunkIndex: chunk.index,
    chunkTotal: chunk.total,
    chunkLength: chunk.script.length,
    text: normalized.text,
    toolCalls: normalized.toolCalls,
    toolResults: normalized.toolResults,
  }
}

export async function runChunkedStoryboardBreaker(
  dramaId: number,
  episodeId: number,
  message: string = DEFAULT_STORYBOARD_BREAKER_MESSAGE,
  chunkChars?: number,
  options: StoryboardBreakerOptions = {},
) {
  const { chunks, maxChars } = await getStoryboardChunks(episodeId, chunkChars)

  logTaskProgress('Agent', 'storyboard-chunks-prepared', {
    episodeId,
    chunks: chunks.length,
    chunkChars: maxChars,
  })
  await options.onProgress?.({ current: 0, total: chunks.length })

  const chunkResults: StoryboardChunkResult[] = []
  const allToolCalls: NormalizedToolCall[] = []
  const allToolResults: NormalizedToolResult[] = []

  for (const chunk of chunks) {
    await options.onProgress?.({
      current: Math.max(0, chunk.index - 1),
      total: chunk.total,
      chunkIndex: chunk.index,
    })

    const result = await runStoryboardChunk(dramaId, episodeId, chunk, message)
    allToolCalls.push(...result.toolCalls)
    allToolResults.push(...result.toolResults)
    chunkResults.push(result)

    await options.onProgress?.({
      current: chunk.index,
      total: chunk.total,
      chunkIndex: chunk.index,
    })
  }

  return {
    type: 'done',
    text: chunkResults.map((item) => item.text).filter(Boolean).join('\n\n'),
    toolCalls: allToolCalls,
    toolResults: allToolResults,
    chunks: chunkResults,
  }
}

// 返回分镜 chunk 计划，供前端逐 chunk 驱动（规避 SCF 单请求 900s 上限）。
app.post('/storyboard_breaker/plan', async (c) => {
  const body = await c.req.json()
  const { drama_id, episode_id } = body
  if (!episode_id || !drama_id) {
    return badRequest(c, 'drama_id and episode_id are required')
  }
  try {
    const { chunks, maxChars } = await getStoryboardChunks(
      Number(episode_id),
      Number(body.storyboard_chunk_chars || 0) || undefined,
    )
    logTaskProgress('Agent', 'storyboard-chunks-prepared', {
      episodeId: Number(episode_id),
      chunks: chunks.length,
      chunkChars: maxChars,
    })
    return success(c, { total: chunks.length, chunkChars: maxChars })
  } catch (err: unknown) {
    const errorMessage = getErrorMessage(err)
    logTaskError('Agent', 'storyboard_breaker-plan', { episodeId: Number(episode_id), error: errorMessage })
    return badRequest(c, errorMessage || 'Failed to plan storyboard chunks')
  }
})

// 处理单个分镜 chunk。chunk_index 从 1 开始，第 1 个会清空已有分镜后再写入。
app.post('/storyboard_breaker/chunk', async (c) => {
  const body = await c.req.json()
  const { drama_id, episode_id, chunk_index } = body
  if (!episode_id || !drama_id) {
    return badRequest(c, 'drama_id and episode_id are required')
  }
  const index = Number(chunk_index)
  if (!Number.isInteger(index) || index < 1) {
    return badRequest(c, 'chunk_index must be a positive integer')
  }

  const startTime = performance.now()
  try {
    const { chunks } = await getStoryboardChunks(
      Number(episode_id),
      Number(body.storyboard_chunk_chars || 0) || undefined,
    )
    const chunk = chunks.find((item) => item.index === index)
    if (!chunk) {
      return badRequest(c, `chunk_index ${index} out of range (total ${chunks.length})`)
    }

    const result = await runStoryboardChunk(
      Number(drama_id),
      Number(episode_id),
      chunk,
      String(body.message || DEFAULT_STORYBOARD_BREAKER_MESSAGE),
    )

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskSuccess('Agent', 'storyboard_breaker-chunk', {
      episodeId: Number(episode_id),
      chunkIndex: result.chunkIndex,
      chunkTotal: result.chunkTotal,
      elapsedSeconds: elapsed,
    })
    return success(c, { type: 'chunk-done', ...result })
  } catch (err: unknown) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    const errorMessage = getErrorMessage(err)
    logTaskError('Agent', 'storyboard_breaker-chunk', {
      episodeId: Number(episode_id),
      chunkIndex: index,
      elapsedSeconds: elapsed,
      error: errorMessage,
    })
    console.error(getErrorStack(err) || err)
    return badRequest(c, errorMessage || 'Storyboard chunk failed')
  }
})

app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!isValidAgentType(agentType)) {
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
        dramaId,
        episodeId,
        String(message || DEFAULT_STORYBOARD_BREAKER_MESSAGE),
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

    const directResult = (agentType === 'script_rewriter' || agentType === 'extractor')
      ? await runDirectAgentIfNeeded(agentType, {
        dramaId,
        episodeId,
        message: String(message || ''),
      })
      : null
    if (directResult) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      logTaskSuccess('Agent', agentType, {
        elapsedSeconds: elapsed,
        agentMode: directResult.agentMode,
      })
      logTaskProgress('Agent', 'tool-summary', {
        agentType,
        agentMode: directResult.agentMode,
        toolCalls: [],
        toolResults: directResult.toolResults.map((tr) => tr.toolName),
      })
      logTaskPayload('Agent', `${agentType} tool-results`, directResult.toolResults)
      return success(c, directResult)
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
  } catch (err: unknown) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    const errorMessage = getErrorMessage(err)
    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: errorMessage })
    console.error(getErrorStack(err) || err)
    return badRequest(c, errorMessage || 'Agent execution failed')
  }
})

app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!isValidAgentType(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app
