import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/generation/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { buildSceneImagePrompt } from '../agents/visual-prompt-policy.js'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = (await db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
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
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  if (body.image_url !== undefined) updates.imageUrl = body.image_url
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl
  if (body.local_path !== undefined) updates.localPath = body.local_path
  if (body.localPath !== undefined) updates.localPath = body.localPath
  if (body.status !== undefined) updates.status = body.status
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
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
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    return badRequest(c, err.message)
  }
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
