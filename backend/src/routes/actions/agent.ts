import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createAgent, generateAgentTextWithoutTools, isValidAgentType } from '../../agents/index.js'
import { runDirectAgentIfNeeded } from '../../agents/direct-mode.js'
import { splitScriptIntoStoryboardChunks, type StoryboardChunk } from '../../agents/storyboard-chunks.js'
import { parseStoryboardsFromText, type StoryboardInput } from '../../agents/storyboard-parse.js'
import { buildStoryboardContext, appendStoryboardChunk } from '../../agents/tools/storyboard-tools.js'
import {
  canSplitStoryboardChunkForRetry,
  nextStoryboardRetryChunkChars,
  resolveStoryboardAdaptivePolicy,
  type StoryboardAdaptivePolicy,
} from '../../agents/storyboard-adaptive-policy.js'
import { db, schema } from '../../db/index.js'
import { getTextConfig } from '../../services/ai/ai.js'
import { success, badRequest } from '../../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import {
  normalizeAgentResult,
  type NormalizedToolCall,
  type NormalizedToolResult,
} from '../../agents/result-normalizer.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedDrama, findOwnedEpisode } from '../shared/ownership.js'

const app = new Hono()

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined
}

export const DEFAULT_EXTRACTOR_MESSAGE = '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并。'
export const DEFAULT_STORYBOARD_BREAKER_MESSAGE = '请拆解分镜并生成视频提示词。'

// 直连模式的输出约束：覆盖预设里的工具步骤，要求模型只输出严格 JSON。对任何能产出 JSON 的模型通用，
// 不依赖 tool-calling。
const STORYBOARD_DIRECT_DIRECTIVE = [
  '================ 输出格式（最高优先级）================',
  '本次为直连模式：不存在、也不要调用任何工具（read_storyboard_context / save_storyboards / append_storyboards 等都不可用）。请忽略上文中任何“调用工具/使用步骤”的说明。',
  '所需的剧本、角色（含 id）、场景（含 id）、项目风格、已有分镜，都已在用户消息的 JSON 中直接给出。',
  'existing_storyboards 只表示当前 script 之前紧邻的连续性锚点：只读取最后一镜的 result、人物位置、场景与道具状态并从那里承接，不要复述或重新生成这些锚点。数组为空时直接从当前 script 开始。',
  '你必须只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块（不要 ```）。结构严格如下：',
  '{"storyboards":[{"shot_number":1,"title":"","shot_type":"","angle":"","movement":"","location":"","time":"","action":"","dialogue":"","description":"","result":"","director_intent":"","audience_info_change":"","emotion_shift":"","dramatic_value":"","atmosphere":"","image_prompt":"","video_prompt":"","bgm_prompt":"","sound_effect":"","duration":10,"scene_id":null,"character_ids":[]}]}',
  '- shot_number 从 1 开始递增即可（系统会自动续接整集真实编号）。',
  '- director_intent / audience_info_change / emotion_shift / dramatic_value 必须说明本镜头的导演意图、观众信息变化、情绪变化和不可删除的戏剧价值。',
  '- 物理过渡镜头允许 audience_info_change 写“无新增剧情信息”，但 dramatic_value 必须说明它完成了哪段不可省略的空间桥接。',
  '- scene_id 与 character_ids 必须取自用户消息中提供的 scenes / characters 的 id；没有合适的就用 null / 空数组，禁止编造 id。',
  '- 除 dialogue 可在无台词时为空字符串外，示例结构中的文字字段都必须填写非空内容；duration 必须是 4-15 的整数。',
  '- 当前视频模型为 Seedance 2.0。video_prompt 必须逐段包含：参考素材绑定、主体与场景、入场与首帧、分秒时间轴、运镜与画面、出场与尾帧、声音与对白、画质与风格、约束与禁止项、失败降级。时间轴从 0.0 秒连续覆盖到 duration，不能有空档或重叠，不要再使用“动作阶段1/2/3”。',
  '- 每个镜头必须输出 first_frame_prompt、last_frame_prompt、transition_in、transition_out、screen_direction、audio_bridge、negative_prompt、fallback_plan、handle_in_ms、handle_out_ms；推荐入出场把手各 500-800 毫秒。',
  '- storyboards 至少包含 1 个镜头。',
].join('\n')

export type StoryboardBreakerProgress = {
  current: number
  total: number
  chunkIndex?: number
}

type StoryboardBreakerOptions = {
  onProgress?: (progress: StoryboardBreakerProgress) => void | Promise<void>
}

function readStoryboardEnvSettings(): Record<string, unknown> {
  const timeoutMs = Number(process.env.STORYBOARD_CHUNK_TIMEOUT_MS)
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? { storyboardChunkTimeoutMs: timeoutMs }
    : {}
}

function readStoryboardChunkChars(body: Record<string, unknown>) {
  return Number(body.storyboard_chunk_chars || 0) || undefined
}

async function loadStoryboardAdaptivePolicy(chunkChars?: number): Promise<StoryboardAdaptivePolicy> {
  let settings: Record<string, unknown> = {}
  try {
    const config = await getTextConfig()
    settings = config.settings || {}
  } catch {}

  return resolveStoryboardAdaptivePolicy({
    ...settings,
    ...readStoryboardEnvSettings(),
  }, {
    chunkChars,
  })
}

export async function runExtractorAgent(
  dramaId: number,
  episodeId: number,
  message: string = DEFAULT_EXTRACTOR_MESSAGE,
  options: { replaceExisting?: boolean; useDefaultPrompt?: boolean } = {},
) {
  const directResult = await runDirectAgentIfNeeded('extractor', {
    dramaId,
    episodeId,
    message,
    replaceExisting: options.replaceExisting,
  })
  if (directResult) return directResult

  const agent = await createAgent('extractor', episodeId, dramaId, {
    useDefaultInstructions: options.useDefaultPrompt,
    extractor: { replaceExisting: options.replaceExisting },
  })
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
  shotCount?: number
  adaptiveChunks?: number
  attempts?: number
  text: string
  toolCalls: NormalizedToolCall[]
  toolResults: NormalizedToolResult[]
}

type AdaptiveStoryboardChunkDraft = {
  storyboards: StoryboardInput[]
  adaptiveChunks: number
  attempts: number
}

// 按集脚本切分分镜 chunk。切分是确定性的：同一脚本与 chunkChars 总是得到相同结果，
// 因此前端可以先取总数，再逐 chunk 调用，每次请求都远低于 SCF 900s 上限。
export async function getStoryboardChunks(
  episodeId: number,
  chunkChars?: number,
  policy?: StoryboardAdaptivePolicy,
) {
  const [episode] = (await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId)).all())
  if (!episode) throw new Error('Episode not found')

  const script = episode.scriptContent || episode.content || ''
  if (!script.trim()) throw new Error('Episode has no script')

  const resolvedPolicy = policy || await loadStoryboardAdaptivePolicy(chunkChars)
  const maxChars = resolvedPolicy.chunkChars
  const chunks = splitScriptIntoStoryboardChunks(script, { maxChars })
  if (!chunks.length) throw new Error('Episode script cannot be split into storyboard chunks')

  return { chunks, maxChars }
}

async function generateStoryboardsForChunk(input: {
  dramaId: number
  episodeId: number
  chunk: StoryboardChunk
  rootChunk: StoryboardChunk
  continuityStoryboards?: StoryboardInput[]
  message: string
  policy: StoryboardAdaptivePolicy
  attempt: number
}): Promise<StoryboardInput[]> {
  const { dramaId, episodeId, chunk, rootChunk, continuityStoryboards = [], message, policy, attempt } = input
  const context = await buildStoryboardContext(episodeId, dramaId, chunk, {
    // 第一个根 chunk 会在成功生成后替换整集旧分镜。生成前不把旧分镜交给模型，
    // 否则“不要重复 existing_storyboards”会让模型跳过本应重新生成的剧情。
    includeExistingStoryboards: rootChunk.index !== 1,
    // 后续 chunk 只需要前两镜的完整出点作为连续性锚点，避免把整集历史重复塞回上下文。
    existingStoryboardLimit: 2,
  })
  if (continuityStoryboards.length) {
    const draftAnchors = continuityStoryboards.slice(-2).map((storyboard, index) => ({
      id: -(index + 1),
      shot_number: storyboard.shot_number,
      title: storyboard.title || '',
      scene_id: storyboard.scene_id,
      character_ids: storyboard.character_ids,
      shot_type: storyboard.shot_type || '',
      angle: storyboard.angle || '',
      movement: storyboard.movement || '',
      location: storyboard.location || '',
      time: storyboard.time || '',
      action: storyboard.action || '',
      dialogue: storyboard.dialogue || '',
      description: storyboard.description || '',
      result: storyboard.result || '',
      first_frame_prompt: storyboard.first_frame_prompt || '',
      last_frame_prompt: storyboard.last_frame_prompt || '',
      transition_in: storyboard.transition_in || '',
      transition_out: storyboard.transition_out || '',
      screen_direction: storyboard.screen_direction || '',
      audio_bridge: storyboard.audio_bridge || '',
      duration: storyboard.duration || 0,
    }))
    context.existing_storyboards = [...context.existing_storyboards, ...draftAnchors].slice(-2)
  }
  const userContent = [
    message,
    `Storyboard chunk ${chunk.index}/${chunk.total}. Only process this chunk script; do not cover other chunks.`,
    'Context JSON:',
    JSON.stringify(context),
  ].join('\n\n')

  const deadline = AbortSignal.timeout(policy.chunkTimeoutMs)
  let rawText: string
  try {
    rawText = await generateAgentTextWithoutTools('storyboard_breaker', STORYBOARD_DIRECT_DIRECTIVE, userContent, {
      abortSignal: deadline,
    })
  } catch (err) {
    if (deadline.aborted) {
      const seconds = Math.round(policy.chunkTimeoutMs / 1000)
      throw new Error(`Storyboard chunk ${chunk.index}/${chunk.total} attempt ${attempt} did not finish within ${seconds}s`)
    }
    throw err
  }

  return parseStoryboardsFromText(rawText)
}

async function generateAdaptiveStoryboardChunk(input: {
  dramaId: number
  episodeId: number
  chunk: StoryboardChunk
  rootChunk: StoryboardChunk
  continuityStoryboards?: StoryboardInput[]
  message: string
  policy: StoryboardAdaptivePolicy
  attempt: number
}): Promise<AdaptiveStoryboardChunkDraft> {
  const { dramaId, episodeId, chunk, rootChunk, continuityStoryboards = [], message, policy, attempt } = input
  logTaskProgress('Agent', 'storyboard-chunk-start', {
    episodeId,
    chunkIndex: rootChunk.index,
    chunkTotal: rootChunk.total,
    chunkLength: chunk.script.length,
    attempt,
  })

  let storyboards: StoryboardInput[]
  try {
    storyboards = await generateStoryboardsForChunk({
      dramaId,
      episodeId,
      chunk,
      rootChunk,
      continuityStoryboards,
      message,
      policy,
      attempt,
    })
  } catch (error) {
    const canRetry = canSplitStoryboardChunkForRetry(chunk.script.length, attempt, policy)
    if (!canRetry) throw error

    const retryChunkChars = nextStoryboardRetryChunkChars(chunk.script.length, policy)
    const retryChunks = splitScriptIntoStoryboardChunks(chunk.script, { maxChars: retryChunkChars })
    if (retryChunks.length <= 1) throw error

    logTaskProgress('Agent', 'storyboard-chunk-adaptive-retry', {
      episodeId,
      chunkIndex: rootChunk.index,
      originalLength: chunk.script.length,
      retryChunkChars,
      retryChunks: retryChunks.length,
      attempt,
      error: getErrorMessage(error),
    })

    const results: AdaptiveStoryboardChunkDraft[] = []
    let retryContinuity = continuityStoryboards.slice(-2)
    for (const retryChunk of retryChunks) {
      const result = await generateAdaptiveStoryboardChunk({
        dramaId,
        episodeId,
        chunk: retryChunk,
        rootChunk,
        continuityStoryboards: retryContinuity,
        message,
        policy,
        attempt: attempt + 1,
      })
      results.push(result)
      retryContinuity = [...retryContinuity, ...result.storyboards].slice(-2)
    }

    return {
      storyboards: results.flatMap(result => result.storyboards),
      adaptiveChunks: results.reduce((sum, result) => sum + (result.adaptiveChunks || 0), 0),
      attempts: Math.max(...results.map(result => result.attempts || attempt), attempt),
    }
  }

  return {
    storyboards,
    adaptiveChunks: 1,
    attempts: attempt,
  }
}

// 直连模式处理单个 chunk：服务端拼好上下文 → 模型一次性输出 JSON → 解析校验 → 复用入库逻辑。
// 不走 agent 工具循环，因此对模型的 tool-calling 能力无要求，任何能输出 JSON 的模型都适用。
export async function runStoryboardChunk(
  dramaId: number,
  episodeId: number,
  chunk: StoryboardChunk,
  message: string = DEFAULT_STORYBOARD_BREAKER_MESSAGE,
): Promise<StoryboardChunkResult> {
  const policy = await loadStoryboardAdaptivePolicy()
  const draft = await generateAdaptiveStoryboardChunk({
    dramaId,
    episodeId,
    chunk,
    rootChunk: chunk,
    message,
    policy,
    attempt: 1,
  })

  const saved = await appendStoryboardChunk(episodeId, dramaId, draft.storyboards, chunk.index === 1, chunk)

  logTaskProgress('Agent', 'storyboard-chunk-tools', {
    episodeId,
    chunkIndex: chunk.index,
    shots: saved.count,
    attempts: draft.attempts,
    adaptiveChunks: draft.adaptiveChunks,
  })

  return {
    chunkIndex: chunk.index,
    chunkTotal: chunk.total,
    chunkLength: chunk.script.length,
    shotCount: saved.count,
    adaptiveChunks: draft.adaptiveChunks,
    attempts: draft.attempts,
    text: `Generated ${saved.count} storyboard shots`,
    toolCalls: [],
    toolResults: [],
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
  const currentUser = getCurrentUser(c)
  const body = await c.req.json()
  const { drama_id, episode_id } = body
  if (!episode_id || !drama_id) {
    return badRequest(c, 'drama_id and episode_id are required')
  }
  const drama = await findOwnedDrama(currentUser.id, Number(drama_id))
  const episode = await findOwnedEpisode(currentUser.id, Number(episode_id))
  if (!drama || !episode || episode.dramaId !== drama.id) return badRequest(c, 'Drama or episode not found')
  try {
    const { chunks, maxChars } = await getStoryboardChunks(
      Number(episode_id),
      readStoryboardChunkChars(body),
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
  const currentUser = getCurrentUser(c)
  const body = await c.req.json()
  const { drama_id, episode_id, chunk_index } = body
  if (!episode_id || !drama_id) {
    return badRequest(c, 'drama_id and episode_id are required')
  }
  const index = Number(chunk_index)
  if (!Number.isInteger(index) || index < 1) {
    return badRequest(c, 'chunk_index must be a positive integer')
  }
  const drama = await findOwnedDrama(currentUser.id, Number(drama_id))
  const episode = await findOwnedEpisode(currentUser.id, Number(episode_id))
  if (!drama || !episode || episode.dramaId !== drama.id) return badRequest(c, 'Drama or episode not found')

  const startTime = performance.now()
  try {
    const { chunks } = await getStoryboardChunks(
      Number(episode_id),
      readStoryboardChunkChars(body),
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
  const currentUser = getCurrentUser(c)
  const agentType = c.req.param('type')
  if (!isValidAgentType(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body
  const replaceExisting = body.replace_existing === true || body.replaceExisting === true
  const useDefaultPrompt = body.use_default_prompt === true || body.useDefaultPrompt === true

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
  const drama = await findOwnedDrama(currentUser.id, dramaId)
  const episode = await findOwnedEpisode(currentUser.id, episodeId)
  if (!drama || !episode || episode.dramaId !== drama.id) return badRequest(c, 'Drama or episode not found')
  const startTime = performance.now()

  try {
    if (agentType === 'storyboard_breaker') {
      const data = await runChunkedStoryboardBreaker(
        dramaId,
        episodeId,
        String(message || DEFAULT_STORYBOARD_BREAKER_MESSAGE),
        readStoryboardChunkChars(body),
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
        replaceExisting,
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

    const agent = await createAgent(agentType, episodeId, dramaId, {
      useDefaultInstructions: agentType === 'extractor' ? useDefaultPrompt : false,
      extractor: agentType === 'extractor' ? { replaceExisting } : undefined,
    })
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
