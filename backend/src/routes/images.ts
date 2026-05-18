import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { generateImage } from '../services/generation/image-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { presentImageGenerationAsset, presentImageGenerationAssets } from '../utils/public-asset.js'
import { errorMessageFromUnknown } from '../utils/error.js'
import { readJsonBody } from './route-body.js'

const app = new Hono()

// POST /images — Generate image
app.post('/', async (c) => {
  const body = await readJsonBody(c)
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt) return badRequest(c, 'prompt is required')

  try {
    let configId: number | undefined = typeof body.config_id === 'number' ? body.config_id : undefined
    if (body.storyboard_id) {
      const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all())
      if (sb) {
        const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all())
        if (ep?.imageConfigId != null) configId = ep.imageConfigId
      }
    }

    logTaskStart('ImageAPI', 'generate', {
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
      frameType: body.frame_type,
    })
    logTaskPayload('ImageAPI', 'request body', body)
    const id = await generateImage({
      storyboardId: typeof body.storyboard_id === 'number' ? body.storyboard_id : undefined,
      dramaId: typeof body.drama_id === 'number' ? body.drama_id : undefined,
      sceneId: typeof body.scene_id === 'number' ? body.scene_id : undefined,
      characterId: typeof body.character_id === 'number' ? body.character_id : undefined,
      prompt,
      model: typeof body.model === 'string' ? body.model : undefined,
      size: typeof body.size === 'string' ? body.size : undefined,
      referenceImages: Array.isArray(body.reference_images) ? body.reference_images as string[] : undefined,
      frameType: typeof body.frame_type === 'string' ? body.frame_type : undefined,
      configId,
    })

    const [record] = (await db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, id)).all())
    logTaskSuccess('ImageAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record ? presentImageGenerationAsset(record) : record)
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Image generation failed')
    logTaskError('ImageAPI', 'generate', { error: message })
    return badRequest(c, message)
  }
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = (await db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all())
  return success(c, row ? presentImageGenerationAsset(row) : null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = (await db.select().from(schema.imageGenerations).all())

  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  return success(c, presentImageGenerationAssets(rows))
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
