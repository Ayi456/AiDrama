import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, now } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { buildSceneImagePrompt, resolveSceneEnvironmentPrompt } from '../../agents/visual-prompt-policy.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { hasOwn, readJsonBody } from '../shared/route-body.js'

const app = new Hono()

type SceneUpdatePatch = {
  updatedAt: string
  location?: string
  time?: string
  prompt?: string
  imageUrl?: string | null
  localPath?: string | null
  status?: string | null
  referenceImage?: string | null
}

// POST /scenes
app.post('/', async (c) => {
  const body = await readJsonBody(c)
  const ts = now()
  const location = typeof body.location === 'string' ? body.location : ''
  const res = (await db.insert(schema.scenes).values({
    dramaId: Number(body.drama_id),
    episodeId: body.episode_id == null ? null : Number(body.episode_id),
    location,
    time: typeof body.time === 'string' ? body.time : '',
    prompt: resolveSceneEnvironmentPrompt(typeof body.prompt === 'string' ? body.prompt : null, location),
    createdAt: ts,
    updatedAt: ts,
  }).run())
  const [result] = (await db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, Number(res.lastInsertRowid))).all())
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const updates: SceneUpdatePatch = { updatedAt: now() }
  if (hasOwn(body, 'location')) updates.location = body.location as string
  if (hasOwn(body, 'time')) updates.time = body.time as string
  if (hasOwn(body, 'prompt')) {
    let fallbackLocation = typeof updates.location === 'string' ? updates.location : ''
    if (!fallbackLocation) {
      const [scene] = await db.select({ location: schema.scenes.location }).from(schema.scenes)
        .where(eq(schema.scenes.id, id))
        .all()
      fallbackLocation = scene?.location || ''
    }
    updates.prompt = resolveSceneEnvironmentPrompt(body.prompt as string, fallbackLocation)
  }
  if (hasOwn(body, 'image_url')) updates.imageUrl = body.image_url as string | null
  if (hasOwn(body, 'imageUrl')) updates.imageUrl = body.imageUrl as string | null
  if (hasOwn(body, 'local_path')) updates.localPath = body.local_path as string | null
  if (hasOwn(body, 'localPath')) updates.localPath = body.localPath as string | null
  if (hasOwn(body, 'status')) updates.status = body.status as string | null
  if (hasOwn(body, 'reference_image')) updates.referenceImage = body.reference_image as string | null
  if (hasOwn(body, 'referenceImage')) updates.referenceImage = body.referenceImage as string | null
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export async function generateSceneImage(sceneId: number, episodeId: number): Promise<number> {
  const [scene] = (await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).all())
  if (!scene) throw new Error('Scene not found')
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all())
  if (!ep) throw new Error('Episode not found')
  const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, scene.dramaId)).all())

  const referenceImage = typeof scene.referenceImage === 'string' ? scene.referenceImage.trim() : ''
  const basePrompt = buildSceneImagePrompt({ ...scene, style: drama?.style || '' }) || `${scene.location}，${scene.time || ''}，高质量场景，统一画风`
  const prompt = referenceImage
    ? `${basePrompt}，参考上传的参考图进行构图与风格延展，结合上述提示词重绘`
    : basePrompt

  logTaskStart('SceneImage', 'generate', { sceneId, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location, mode: referenceImage ? 'image-to-image' : 'text-to-image' })
  await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, sceneId)).run()
  try {
    const genId = await generateImage({
      sceneId,
      dramaId: scene.dramaId,
      prompt,
      configId: ep.imageConfigId ?? undefined,
      referenceImages: referenceImage ? [referenceImage] : undefined,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId, generationId: genId })
    return genId
  } catch (error: unknown) {
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, sceneId)).run()
    throw error
  }
}

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  try {
    const genId = await generateSceneImage(id, Number(body.episode_id))
    return success(c, { image_generation_id: genId })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Scene image generation failed')
    logTaskError('SceneImage', 'generate', { sceneId: id, error: message })
    return badRequest(c, message)
  }
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
