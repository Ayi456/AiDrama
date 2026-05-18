import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/generation/image-generation.js'
import { resolveCharacterAssetReferenceImages } from '../services/assets/character-asset-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { buildCharacterPortraitGenerationPrompt } from '../agents/visual-prompt-policy.js'
import { errorMessageFromUnknown } from '../utils/error.js'
import { hasOwn, readJsonBody } from './route-body.js'

const app = new Hono()

type CharacterUpdatePatch = {
  updatedAt: string
  name?: string
  role?: string | null
  description?: string | null
  appearance?: string | null
  personality?: string | null
  imageUrl?: string | null
  localPath?: string | null
  characterAssetId?: number | null
}

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const updates: CharacterUpdatePatch = { updatedAt: now() }

  if (hasOwn(body, 'name')) updates.name = body.name as string
  if (hasOwn(body, 'role')) updates.role = body.role as string | null
  if (hasOwn(body, 'description')) updates.description = body.description as string | null
  if (hasOwn(body, 'appearance')) updates.appearance = body.appearance as string | null
  if (hasOwn(body, 'personality')) updates.personality = body.personality as string | null
  if (hasOwn(body, 'image_url')) updates.imageUrl = body.image_url as string | null
  if (hasOwn(body, 'imageUrl')) updates.imageUrl = body.imageUrl as string | null
  if (hasOwn(body, 'local_path')) updates.localPath = body.local_path as string | null
  if (hasOwn(body, 'localPath')) updates.localPath = body.localPath as string | null
  if (hasOwn(body, 'character_asset_id')) updates.characterAssetId = Number(body.character_asset_id || body.characterAssetId || 0) || null
  else if (hasOwn(body, 'characterAssetId')) updates.characterAssetId = Number(body.characterAssetId || 0) || null

  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/bind-asset
app.post('/:id/bind-asset', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const assetId = Number(body.character_asset_id || body.characterAssetId || 0)
  if (!assetId) return badRequest(c, '请选择角色形象')

  const [asset] = await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, assetId)).all()
  if (!asset || asset.deletedAt || asset.isActive === false) return badRequest(c, '角色形象未找到')

  await db.update(schema.characters)
    .set({ characterAssetId: assetId, updatedAt: now() })
    .where(eq(schema.characters.id, id))
    .run()
  return success(c)
})

// DELETE /characters/:id/bind-asset
app.delete('/:id/bind-asset', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characters)
    .set({ characterAssetId: null, updatedAt: now() })
    .where(eq(schema.characters.id, id))
    .run()
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const [char] = (await db.select().from(schema.characters).where(eq(schema.characters.id, id)).all())
  if (!char) return badRequest(c, 'Character not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all())
  if (!ep) return badRequest(c, 'Episode not found')
  const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all())

  const prompt = buildCharacterPortraitGenerationPrompt({ ...char, style: drama?.style || '' }) || `${char.name}, 人物立绘, 高清质感, 三张并排的全身图, 纯白背景, 无文字标签`
  try {
    const [asset] = char.characterAssetId
      ? await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, char.characterAssetId)).all()
      : []
    const referenceImages = resolveCharacterAssetReferenceImages(char, asset)
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const genId = await generateImage({
      characterId: id,
      dramaId: char.dramaId,
      prompt,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      configId: typeof ep.imageConfigId === 'number' ? ep.imageConfigId : undefined,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Character image generation failed')
    logTaskError('CharacterImage', 'generate', { characterId: id, error: message })
    return badRequest(c, message)
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await readJsonBody(c)
  const ids = Array.isArray(body.character_ids) ? body.character_ids as number[] : []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all())
  if (!ep) return badRequest(c, 'Episode not found')

  const results: number[] = []
  for (const charId of ids) {
    const [char] = (await db.select().from(schema.characters).where(eq(schema.characters.id, charId)).all())
    if (!char) continue
    const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all())
    const prompt = buildCharacterPortraitGenerationPrompt({ ...char, style: drama?.style || '' }) || `${char.name}, 人物立绘, 高清质感, 三张并排的全身图, 纯白背景, 无文字标签`
    try {
      const [asset] = char.characterAssetId
        ? await db.select().from(schema.characterAssets).where(eq(schema.characterAssets.id, char.characterAssetId)).all()
        : []
      const referenceImages = resolveCharacterAssetReferenceImages(char, asset)
      const genId = await generateImage({
        characterId: charId,
        dramaId: char.dramaId,
        prompt,
        referenceImages: referenceImages.length ? referenceImages : undefined,
        configId: typeof ep.imageConfigId === 'number' ? ep.imageConfigId : undefined,
      })
      results.push(genId)
    } catch {
      // Continue batch generation even if one character fails.
    }
  }

  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
