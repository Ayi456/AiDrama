import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, now } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { buildSceneImagePrompt } from '../../agents/visual-prompt-policy.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody } from '../shared/route-body.js'
import { toSnakeCase } from '../../utils/transform.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedDrama, findOwnedEpisode, findOwnedScene } from '../shared/ownership.js'
import {
  buildSceneCreateValues,
  buildSceneUpdatePatch,
  needsSceneUpdateLocationFallback,
  readSceneCreateInput,
} from '../policies/scene-route-policy.js'

const app = new Hono()

async function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const existing = await db.select().from(schema.episodeScenes)
    .where(and(eq(schema.episodeScenes.episodeId, episodeId), eq(schema.episodeScenes.sceneId, sceneId)))
    .all()
  if (existing.length) return
  await db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: now() }).run()
}

// POST /scenes
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const ts = now()
  const input = readSceneCreateInput(body)
  const { dramaId, episodeId, location } = input

  if (!dramaId) return badRequest(c, 'drama_id is required')
  if (!location) return badRequest(c, '场景地点不能为空')

  const drama = await findOwnedDrama(currentUser.id, dramaId)
  if (!drama) return badRequest(c, 'Drama not found')

  if (episodeId) {
    const episode = await findOwnedEpisode(currentUser.id, episodeId)
    if (!episode) return badRequest(c, 'Episode not found')
    if (episode.dramaId !== dramaId) return badRequest(c, 'episode_id does not belong to drama_id')
  }

  const res = (await db.insert(schema.scenes).values(buildSceneCreateValues(body, input, ts)).run())
  const sceneId = Number(res.lastInsertRowid)
  if (episodeId) await linkSceneToEpisode(episodeId, sceneId)

  const [result] = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, sceneId)).all()
  return created(c, toSnakeCase(result))
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const ownedScene = await findOwnedScene(currentUser.id, id)
  if (!ownedScene) return badRequest(c, 'Scene not found')
  const body = await readJsonBody(c)
  let existingLocation = ''
  if (needsSceneUpdateLocationFallback(body)) {
    const [scene] = await db.select({ location: schema.scenes.location }).from(schema.scenes)
      .where(eq(schema.scenes.id, id))
      .all()
    existingLocation = scene?.location || ''
  }
  const updates = buildSceneUpdatePatch(body, now(), existingLocation)
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
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const scene = await findOwnedScene(currentUser.id, id)
  if (!scene) return badRequest(c, 'Scene not found')
  const episode = await findOwnedEpisode(currentUser.id, Number(body.episode_id))
  if (!episode) return badRequest(c, 'Episode not found')
  if (episode.dramaId !== scene.dramaId) return badRequest(c, 'episode_id does not belong to scene drama')
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
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const scene = await findOwnedScene(currentUser.id, id)
  if (!scene) return badRequest(c, 'Scene not found')
  await db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
