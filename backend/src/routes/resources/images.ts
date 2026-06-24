import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { presentImageGenerationAsset, presentImageGenerationAssets } from '../../utils/public-asset.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody } from '../shared/route-body.js'
import {
  buildImageGenerationInput,
  buildImageRouteLogContext,
  readImageOwnershipIds,
  readImageRequestedConfigId,
  validateImageGenerateBody,
  type ImageGenerateBody,
} from '../policies/image-route-policy.js'
import { getCurrentUser } from '../../middleware/auth.js'
import {
  filterOwnedImageGenerations,
  findOwnedCharacter,
  findOwnedDrama,
  findOwnedImageGeneration,
  findOwnedScene,
  findOwnedStoryboard,
} from '../shared/ownership.js'

const app = new Hono()

// POST /images — Generate image
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c) as ImageGenerateBody
  const validationError = validateImageGenerateBody(body)
  if (validationError) return badRequest(c, validationError)
  const ownershipIds = readImageOwnershipIds(body)
  if (ownershipIds.dramaId !== undefined && !await findOwnedDrama(currentUser.id, ownershipIds.dramaId)) return badRequest(c, 'Drama not found')
  if (ownershipIds.storyboardId !== undefined && !await findOwnedStoryboard(currentUser.id, ownershipIds.storyboardId)) return badRequest(c, 'Storyboard not found')
  if (ownershipIds.sceneId !== undefined && !await findOwnedScene(currentUser.id, ownershipIds.sceneId)) return badRequest(c, 'Scene not found')
  if (ownershipIds.characterId !== undefined && !await findOwnedCharacter(currentUser.id, ownershipIds.characterId)) return badRequest(c, 'Character not found')

  try {
    let configId = readImageRequestedConfigId(body)
    if (ownershipIds.storyboardId !== undefined) {
      const [sb] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, ownershipIds.storyboardId)).all())
      if (sb) {
        const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all())
        if (ep?.imageConfigId != null) configId = ep.imageConfigId
      }
    }

    logTaskStart('ImageAPI', 'generate', buildImageRouteLogContext(body))
    logTaskPayload('ImageAPI', 'request body', body)
    const id = await generateImage(buildImageGenerationInput(body, configId))

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
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedImageGeneration(currentUser.id, id)
  return success(c, row ? presentImageGenerationAsset(row) : null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')
  if (storyboardId && !await findOwnedStoryboard(currentUser.id, Number(storyboardId))) return success(c, [])
  if (dramaId && !await findOwnedDrama(currentUser.id, Number(dramaId))) return success(c, [])

  let rows = (await db.select().from(schema.imageGenerations).all())

  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  return success(c, presentImageGenerationAssets(await filterOwnedImageGenerations(currentUser.id, rows)))
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const row = await findOwnedImageGeneration(currentUser.id, id)
  if (!row) return badRequest(c, 'Image generation not found')
  await db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
