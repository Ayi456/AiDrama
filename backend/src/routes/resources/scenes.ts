import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, now } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { buildSceneImagePrompt } from '../../agents/visual-prompt-policy.js'
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
}

// POST /scenes
app.post('/', async (c) => {
  const body = await readJsonBody(c)
  const ts = now()
  const res = (await db.insert(schema.scenes).values({
    dramaId: Number(body.drama_id),
    episodeId: body.episode_id == null ? null : Number(body.episode_id),
    location: typeof body.location === 'string' ? body.location : '',
    time: typeof body.time === 'string' ? body.time : '',
    prompt: typeof body.prompt === 'string' ? body.prompt : (typeof body.location === 'string' ? body.location : ''),
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
  if (hasOwn(body, 'prompt')) updates.prompt = body.prompt as string
  if (hasOwn(body, 'image_url')) updates.imageUrl = body.image_url as string | null
  if (hasOwn(body, 'imageUrl')) updates.imageUrl = body.imageUrl as string | null
  if (hasOwn(body, 'local_path')) updates.localPath = body.local_path as string | null
  if (hasOwn(body, 'localPath')) updates.localPath = body.localPath as string | null
  if (hasOwn(body, 'status')) updates.status = body.status as string | null
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const [scene] = (await db.select().from(schema.scenes).where(eq(schema.scenes.id, id)).all())
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all())
  if (!ep) return badRequest(c, 'Episode not found')
  const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, scene.dramaId)).all())

  const prompt = buildSceneImagePrompt({ ...scene, style: drama?.style || '' }) || `${scene.location}，${scene.time || ''}，高质量场景，统一画风`
  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    const genId = await generateImage({ sceneId: id, dramaId: scene.dramaId, prompt, configId: ep.imageConfigId ?? undefined })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Scene image generation failed')
    logTaskError('SceneImage', 'generate', { sceneId: id, error: message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
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
