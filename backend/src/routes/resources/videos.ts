import { Hono } from 'hono'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest } from '../../utils/response.js'
import { generateVideo } from '../../services/generation/video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { presentVideoGenerationAsset, presentVideoGenerationAssets } from '../../utils/public-asset.js'
import { appendProjectStyleToVideoPrompt } from '../../agents/visual-prompt-policy.js'
import {
  buildVideoGenerationInput,
  buildVideoRouteLogContext,
  errorMessageFromUnknown,
  readVideoListLimit,
  readVideoListNumber,
  validateVideoGenerateBody,
  type VideoGenerateBody,
} from '../policies/video-route-policy.js'

const app = new Hono()

// POST /videos - Generate video
app.post('/', async (c) => {
  const body = await c.req.json() as VideoGenerateBody
  const validationError = validateVideoGenerateBody(body)
  if (validationError) return badRequest(c, validationError)

  try {
    let configId: number | undefined = body.config_id
    if (body.storyboard_id) {
      const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all())
      if (sb) {
        const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all())
        if (ep?.videoConfigId != null) configId = ep.videoConfigId
      }
    }

    logTaskStart('VideoAPI', 'generate', buildVideoRouteLogContext(body))
    logTaskPayload('VideoAPI', 'request body', body)
    const id = await generateVideo(buildVideoGenerationInput(body, configId))

    const [record] = (await db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, id)).all())
    logTaskSuccess('VideoAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record ? presentVideoGenerationAsset(record) : record)
  } catch (err: unknown) {
    const message = errorMessageFromUnknown(err)
    logTaskError('VideoAPI', 'generate', { error: message })
    return badRequest(c, message)
  }
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = (await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id)).all())
  return success(c, row ? presentVideoGenerationAsset(row) : null)
})

// GET /videos - List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = readVideoListNumber(c.req.query('storyboard_id'))
  const dramaId = readVideoListNumber(c.req.query('drama_id'))
  const limit = readVideoListLimit(c.req.query('limit'))
  const conditions: SQL[] = []

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

  return success(c, presentVideoGenerationAssets(rows))
})

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
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

  const id = await generateVideo({
    storyboardId: input.storyboardId,
    dramaId,
    prompt,
    referenceMode: input.referenceMode || 'first_last',
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl,
    referenceImageUrls: input.referenceImageUrls,
    referenceVideoUrls: input.referenceVideoUrls,
    referenceAudioUrls: input.referenceAudioUrls,
    duration: sb.duration && sb.duration > 0 ? sb.duration : undefined,
    configId,
  })

  logTaskSuccess('VideoAPI', 'auto-generate', { storyboardId: input.storyboardId, generationId: id })
  return id
}

export default app
