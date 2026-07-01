import { Hono } from 'hono'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest } from '../../utils/response.js'
import { generateVideo, refreshVideoGenerationStatus } from '../../services/generation/video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { presentVideoGenerationAsset, presentVideoGenerationAssets } from '../../utils/public-asset.js'
import { appendProjectStyleToVideoPrompt } from '../../agents/visual-prompt-policy.js'
import {
  buildVideoGenerationInput,
  buildVideoRouteLogContext,
  errorMessageFromUnknown,
  presentEffectiveVideoGenerationAsset,
  refreshReadableVideoGenerationRow,
  refreshReadableVideoGenerationRows,
  readVideoListLimit,
  readVideoListNumber,
  resolveVideoStartDuration,
  validateVideoGenerateBody,
  type VideoGenerateBody,
} from '../policies/video-route-policy.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { assertCanStartVideo, isInsufficientBalanceError } from '../../services/billing/wallet.js'
import { retryVideoSettlement } from '../../services/billing/video-billing.js'
import { buildStaleVideoGenerationFailurePatch } from '../../services/automation/video-generation-staleness-policy.js'
import {
  filterOwnedVideoGenerations,
  findOwnedDrama,
  findOwnedStoryboard,
  findOwnedVideoGeneration,
} from '../shared/ownership.js'

const app = new Hono()

// POST /videos - Generate video
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await c.req.json() as VideoGenerateBody
  const validationError = validateVideoGenerateBody(body)
  if (validationError) return badRequest(c, validationError)
  if (body.drama_id && !await findOwnedDrama(currentUser.id, Number(body.drama_id))) return badRequest(c, 'Drama not found')
  const ownedStoryboard = body.storyboard_id
    ? await findOwnedStoryboard(currentUser.id, Number(body.storyboard_id))
    : null
  if (body.storyboard_id && !ownedStoryboard) return badRequest(c, 'Storyboard not found')

  try {
    await assertCanStartVideo(currentUser.id, resolveVideoStartDuration(body, ownedStoryboard?.duration ?? null))

    let configId: number | undefined = body.config_id
    if (ownedStoryboard) {
      const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, ownedStoryboard.episodeId)).all())
      if (ep?.videoConfigId != null) configId = ep.videoConfigId
    }

    logTaskStart('VideoAPI', 'generate', buildVideoRouteLogContext(body))
    logTaskPayload('VideoAPI', 'request body', body)
    const id = await generateVideo({
      ...buildVideoGenerationInput(body, configId),
      userId: currentUser.id,
    })

    const [record] = (await db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, id)).all())
    logTaskSuccess('VideoAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record ? presentVideoGenerationAsset(record) : record)
  } catch (err: unknown) {
    if (isInsufficientBalanceError(err)) {
      return c.json({
        code: 400,
        data: { reason: 'INSUFFICIENT_BALANCE' },
        message: '余额不足，请先充值',
      }, 400)
    }
    const message = errorMessageFromUnknown(err)
    logTaskError('VideoAPI', 'generate', { error: message })
    return badRequest(c, message)
  }
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedVideoGeneration(currentUser.id, id)
  if (!row) return success(c, null)

  const refreshedRow = await refreshVideoGenerationForRead(row)
  const freshRow = await expireStaleVideoGeneration(refreshedRow)
  const effective = await loadLatestEffectiveVideoGeneration(freshRow)
  const refreshedEffective = effective ? await refreshVideoGenerationForRead(effective) : null
  const freshEffective = refreshedEffective ? await expireStaleVideoGeneration(refreshedEffective) : null
  return success(c, presentEffectiveVideoGenerationAsset(freshRow, freshEffective))
})

// POST /videos/:id/billing/retry
app.post('/:id/billing/retry', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedVideoGeneration(currentUser.id, id)
  if (!row) return badRequest(c, 'Video generation not found')

  try {
    await retryVideoSettlement(currentUser.id, id)
    const [updated] = await db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, id))
      .all()
    return success(c, updated ? presentVideoGenerationAsset(updated) : null)
  } catch (err) {
    if (isInsufficientBalanceError(err)) {
      return c.json({
        code: 400,
        data: { reason: 'INSUFFICIENT_BALANCE' },
        message: '余额不足，请先充值',
      }, 400)
    }
    return badRequest(c, errorMessageFromUnknown(err))
  }
})

// GET /videos - List by storyboard_id or drama_id
app.get('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const storyboardId = readVideoListNumber(c.req.query('storyboard_id'))
  const dramaId = readVideoListNumber(c.req.query('drama_id'))
  const limit = readVideoListLimit(c.req.query('limit'))
  const conditions: SQL[] = []
  if (storyboardId && !await findOwnedStoryboard(currentUser.id, storyboardId)) return success(c, [])
  if (dramaId && !await findOwnedDrama(currentUser.id, dramaId)) return success(c, [])

  if (storyboardId) conditions.push(eq(schema.videoGenerations.storyboardId, storyboardId))
  if (dramaId) conditions.push(eq(schema.videoGenerations.dramaId, dramaId))

  const rows = conditions.length
    ? await db.select().from(schema.videoGenerations)
      .where(and(...conditions))
      .orderBy(desc(schema.videoGenerations.id))
      .limit(limit)
      .all()
    : await db.select().from(schema.videoGenerations)
      .orderBy(desc(schema.videoGenerations.id))
      .limit(limit)
      .all()

  const ownedRows = await filterOwnedVideoGenerations(currentUser.id, rows)
  const refreshedRows = await refreshVideoGenerationsForRead(ownedRows)
  const freshRows = await expireStaleVideoGenerations(refreshedRows)
  return success(c, presentVideoGenerationAssets(freshRows))
})

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedVideoGeneration(currentUser.id, id)
  if (!row) return badRequest(c, 'Video generation not found')
  await db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).run()
  return success(c)
})

export type GenerateStoryboardVideoInput = {
  storyboardId: number
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[] | string
  referenceVideoUrls?: string[] | string
  referenceAudioUrls?: string[] | string
  referenceMode?: string
}

export async function generateStoryboardVideo(input: GenerateStoryboardVideoInput): Promise<number> {
  const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, input.storyboardId)).all())
  if (!sb) throw new Error('Storyboard not found')
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all())
  if (!ep) throw new Error('Episode not found')

  const dramaId = typeof ep.dramaId === 'number' ? ep.dramaId : undefined
  const [drama] = dramaId
    ? (await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all())
    : []

  const basePrompt = sb.videoPrompt || sb.imagePrompt || sb.description || sb.title || `镜头 ${sb.storyboardNumber ?? sb.id}`
  const prompt = appendProjectStyleToVideoPrompt(basePrompt, drama?.style)
  const configId = typeof ep.videoConfigId === 'number' ? ep.videoConfigId : undefined
  const ownerUserId = typeof drama?.userId === 'number' ? drama.userId : undefined
  const duration = sb.duration && sb.duration > 0 ? sb.duration : undefined
  if (ownerUserId) await assertCanStartVideo(ownerUserId, duration || 5)

  const id = await generateVideo({
    userId: ownerUserId,
    storyboardId: input.storyboardId,
    dramaId,
    prompt,
    referenceMode: input.referenceMode || 'first_last',
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl,
    referenceImageUrls: input.referenceImageUrls,
    referenceVideoUrls: input.referenceVideoUrls,
    referenceAudioUrls: input.referenceAudioUrls,
    duration,
    configId,
  })

  logTaskSuccess('VideoAPI', 'auto-generate', { storyboardId: input.storyboardId, generationId: id })
  return id
}

async function expireStaleVideoGeneration<T extends typeof schema.videoGenerations.$inferSelect>(row: T): Promise<T> {
  const patch = buildStaleVideoGenerationFailurePatch(row)
  if (!patch) return row

  await db.update(schema.videoGenerations)
    .set(patch)
    .where(eq(schema.videoGenerations.id, row.id))
    .run()

  return { ...row, ...patch }
}

async function reloadVideoGeneration(id: number) {
  const [row] = await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id))
    .all()
  return row || null
}

async function refreshVideoGenerationForRead<T extends typeof schema.videoGenerations.$inferSelect>(row: T): Promise<T> {
  return await refreshReadableVideoGenerationRow(row, {
    refreshStatus: refreshVideoGenerationStatus,
    reload: async id => await reloadVideoGeneration(id) as T | null,
    onRefreshError: (error, currentRow) => {
      logTaskError('VideoAPI', 'read-refresh-failed', {
        generationId: currentRow.id,
        taskId: currentRow.taskId || '',
        error: errorMessageFromUnknown(error),
      })
    },
  })
}

async function refreshVideoGenerationsForRead<T extends typeof schema.videoGenerations.$inferSelect>(rows: T[]): Promise<T[]> {
  return await refreshReadableVideoGenerationRows(rows, {
    refreshStatus: refreshVideoGenerationStatus,
    reload: async id => await reloadVideoGeneration(id) as T | null,
    onRefreshError: (error, currentRow) => {
      logTaskError('VideoAPI', 'list-refresh-failed', {
        generationId: currentRow.id,
        taskId: currentRow.taskId || '',
        error: errorMessageFromUnknown(error),
      })
    },
  })
}

async function expireStaleVideoGenerations<T extends typeof schema.videoGenerations.$inferSelect>(rows: T[]): Promise<T[]> {
  return await Promise.all(rows.map(row => expireStaleVideoGeneration(row)))
}

async function loadLatestEffectiveVideoGeneration(row: typeof schema.videoGenerations.$inferSelect) {
  let effective = row
  const seen = new Set<number>()

  for (let depth = 0; depth < 8; depth += 1) {
    const currentId = effective.id
    if (!currentId || seen.has(currentId)) break
    seen.add(currentId)

    const [child] = (await db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.defectCheckParentId, currentId))
      .orderBy(desc(schema.videoGenerations.id))
      .limit(1)
      .all())
    if (!child) break
    effective = child
  }

  return effective.id === row.id ? null : effective
}

export default app
