import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, badRequest, now } from '../../utils/response.js'
import { generateImage } from '../../services/generation/image-generation.js'
import { resolveCharacterAssetReferenceImages } from '../../services/assets/character-asset-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { resolveCharacterImagePrompt } from '../../agents/visual-prompt-policy.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody } from '../shared/route-body.js'
import { toSnakeCase } from '../../utils/transform.js'
import { getCurrentUser } from '../../middleware/auth.js'
import {
  findOwnedCharacter,
  findOwnedCharacterAsset,
  findOwnedDrama,
  findOwnedEpisode,
} from '../shared/ownership.js'
import {
  buildCharacterImageSyncPatch,
  buildCharacterCreateValues,
  buildCharacterUpdatePatch,
  readCharacterBindAssetId,
  readCharacterCreateInput,
} from '../policies/character-route-policy.js'

const app = new Hono()

async function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = await db.select().from(schema.episodeCharacters)
    .where(and(eq(schema.episodeCharacters.episodeId, episodeId), eq(schema.episodeCharacters.characterId, characterId)))
    .all()
  if (existing.length) return
  await db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() }).run()
}

// POST /characters
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const input = readCharacterCreateInput(body)
  const { dramaId, episodeId, characterAssetId, name } = input

  if (!dramaId) return badRequest(c, 'drama_id is required')
  if (!name) return badRequest(c, '角色名不能为空')

  const drama = await findOwnedDrama(currentUser.id, dramaId)
  if (!drama) return badRequest(c, 'Drama not found')

  if (episodeId) {
    const episode = await findOwnedEpisode(currentUser.id, episodeId)
    if (!episode) return badRequest(c, 'Episode not found')
    if (episode.dramaId !== dramaId) return badRequest(c, 'episode_id does not belong to drama_id')
  }

  if (characterAssetId) {
    const asset = await findOwnedCharacterAsset(currentUser.id, characterAssetId)
    if (!asset || asset.deletedAt || asset.isActive === false) return badRequest(c, '角色形象未找到')
  }

  const ts = now()
  const res = await db.insert(schema.characters).values(buildCharacterCreateValues(body, input, ts)).run()

  const characterId = Number(res.lastInsertRowid)
  if (episodeId) await linkCharacterToEpisode(episodeId, characterId)

  const [character] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  return created(c, toSnakeCase(character))
})

// PUT /characters/:id
app.put('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const character = await findOwnedCharacter(currentUser.id, id)
  if (!character) return badRequest(c, 'Character not found')
  const body = await readJsonBody(c)
  const updates = buildCharacterUpdatePatch(body, now())
  const imageSyncPatch = buildCharacterImageSyncPatch(updates)

  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  if (imageSyncPatch && character.name) {
    await db.update(schema.characters)
      .set(imageSyncPatch)
      .where(and(
        eq(schema.characters.dramaId, character.dramaId),
        eq(schema.characters.name, character.name),
      ))
      .run()
  }
  return success(c)
})

// POST /characters/:id/bind-asset
app.post('/:id/bind-asset', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const character = await findOwnedCharacter(currentUser.id, id)
  if (!character) return badRequest(c, 'Character not found')
  const body = await readJsonBody(c)
  const assetId = readCharacterBindAssetId(body)
  if (!assetId) return badRequest(c, '请选择角色形象')

  const asset = await findOwnedCharacterAsset(currentUser.id, assetId)
  if (!asset || asset.deletedAt || asset.isActive === false) return badRequest(c, '角色形象未找到')

  await db.update(schema.characters)
    .set({ characterAssetId: assetId, updatedAt: now() })
    .where(eq(schema.characters.id, id))
    .run()
  return success(c)
})

// DELETE /characters/:id/bind-asset
app.delete('/:id/bind-asset', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const character = await findOwnedCharacter(currentUser.id, id)
  if (!character) return badRequest(c, 'Character not found')
  await db.update(schema.characters)
    .set({ characterAssetId: null, updatedAt: now() })
    .where(eq(schema.characters.id, id))
    .run()
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const character = await findOwnedCharacter(currentUser.id, id)
  if (!character) return badRequest(c, 'Character not found')
  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const body = await readJsonBody(c)
  const char = await findOwnedCharacter(currentUser.id, id)
  if (!char) return badRequest(c, 'Character not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const ep = await findOwnedEpisode(currentUser.id, Number(body.episode_id))
  if (!ep) return badRequest(c, 'Episode not found')
  if (ep.dramaId !== char.dramaId) return badRequest(c, 'episode_id does not belong to character drama')
  const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all())

  const prompt = resolveCharacterImagePrompt({ ...char, style: drama?.style || '' })
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

export async function generateCharacterImageBatch(episodeId: number, characterIds: number[]): Promise<number[]> {
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all())
  if (!ep) throw new Error('Episode not found')

  const results: number[] = []
  for (const charId of characterIds) {
    const [char] = (await db.select().from(schema.characters).where(eq(schema.characters.id, charId)).all())
    if (!char) continue
    const [drama] = (await db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all())
    const prompt = resolveCharacterImagePrompt({ ...char, style: drama?.style || '' })
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

  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: characterIds.length, started: results.length })
  return results
}

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const ids = Array.isArray(body.character_ids) ? body.character_ids as number[] : []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const episode = await findOwnedEpisode(currentUser.id, Number(body.episode_id))
  if (!episode) return badRequest(c, 'Episode not found')
  const ownedIds: number[] = []
  for (const id of ids) {
    const character = await findOwnedCharacter(currentUser.id, Number(id))
    if (character && character.dramaId === episode.dramaId) ownedIds.push(Number(id))
  }
  const results = await generateCharacterImageBatch(Number(body.episode_id), ownedIds)
  return success(c, { count: results.length, ids: results })
})

export default app
