import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, notFound, badRequest, now } from '../../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../../utils/transform.js'
import { readJsonBody } from '../shared/route-body.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedDrama, findOwnedEpisode } from '../shared/ownership.js'
import { resolveCharacterImagePrompt, resolveSceneEnvironmentPrompt } from '../../agents/visual-prompt-policy.js'
import {
  buildChapterCreateValues,
  buildChapterUpdatePatch,
  readChapterConfigId,
  readChapterDramaId,
} from '../policies/chapter-route-policy.js'

const app = new Hono()

type CharacterRow = typeof schema.characters.$inferSelect
type CharacterAssetRow = typeof schema.characterAssets.$inferSelect

async function loadCharacterAssetMap(characters: CharacterRow[]) {
  const assetIds = [...new Set(characters.map((character) => character.characterAssetId).filter((id): id is number => Boolean(id)))]
  if (!assetIds.length) return new Map<number, CharacterAssetRow>()

  const assets = (await db.select().from(schema.characterAssets).all())
    .filter((asset) => assetIds.includes(asset.id) && !asset.deletedAt && asset.isActive !== false)
  return new Map(assets.map((asset) => [asset.id, asset]))
}

function presentCharacterWithAsset(character: CharacterRow, assetMap: Map<number, CharacterAssetRow>, dramaStyle?: string | null) {
  const asset = character.characterAssetId ? assetMap.get(character.characterAssetId) : null
  const snake = toSnakeCase(character) as Record<string, unknown>
  snake.image_prompt = resolveCharacterImagePrompt({ ...character, style: dramaStyle || '' })
  return {
    ...snake,
    character_asset: asset
      ? {
        id: asset.id,
        name: asset.name,
        image_url: asset.imageUrl,
        reference_image: asset.referenceImage,
        local_path: asset.localPath,
        role_preset: asset.rolePreset,
      }
      : null,
    character_asset_image_url: asset?.referenceImage || asset?.imageUrl || null,
  }
}

async function loadEpisodeDramaStyle(episodeId: number): Promise<string> {
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return ''
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return drama?.style || ''
}

// POST /chapters - Create a new chapter
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await readJsonBody(c)
  const dramaId = readChapterDramaId(body)
  if (!dramaId) return badRequest(c, 'drama_id required')
  const drama = await findOwnedDrama(currentUser.id, dramaId)
  if (!drama) return notFound(c, 'Drama not found')

  const imageConfigId = readChapterConfigId(body, 'image_config_id')
  const videoConfigId = readChapterConfigId(body, 'video_config_id')
  if (!imageConfigId || !videoConfigId) {
    return badRequest(c, 'image_config_id and video_config_id are required')
  }

  const ts = now()
  const existing = await db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .orderBy(schema.episodes.episodeNumber)
    .all()
  const nextNum = existing.length ? Math.max(...existing.map((episode) => episode.episodeNumber)) + 1 : 1

  const res = await db.insert(schema.episodes).values(
    buildChapterCreateValues(body, nextNum, ts, imageConfigId, videoConfigId),
  ).run()

  const [ep] = await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, Number(res.lastInsertRowid)))
    .all()

  return success(c, {
    id: ep.id,
    episode_number: ep.episodeNumber,
    title: ep.title,
    image_config_id: ep.imageConfigId,
    video_config_id: ep.videoConfigId,
  })
})

// PUT /chapters/:id - Update chapter fields
app.put('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const episode = await findOwnedEpisode(currentUser.id, id)
  if (!episode) return notFound(c, 'Chapter not found')
  const body = await readJsonBody(c)

  const updates = buildChapterUpdatePatch(body, now())
  if (Object.keys(updates).length === 1) return badRequest(c, 'no valid fields')

  await db.update(schema.episodes).set(updates).where(eq(schema.episodes.id, id)).run()
  return success(c)
})

// GET /chapters/:id/characters - characters linked to this chapter
app.get('/:id/characters', async (c) => {
  const currentUser = getCurrentUser(c)
  const episodeId = Number(c.req.param('id'))
  const episode = await findOwnedEpisode(currentUser.id, episodeId)
  if (!episode) return notFound(c, 'Chapter not found')
  const links = await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .all()
  const charIds = links.map((link) => link.characterId)
  if (!charIds.length) return success(c, [])

  const allChars = await db.select().from(schema.characters).all()
  const result = allChars.filter((character) => charIds.includes(character.id) && !character.deletedAt)
  const assetMap = await loadCharacterAssetMap(result)
  const dramaStyle = await loadEpisodeDramaStyle(episodeId)
  return success(c, result.map((character) => presentCharacterWithAsset(character, assetMap, dramaStyle)))
})

// GET /chapters/:id/scenes - scenes linked to this chapter
app.get('/:id/scenes', async (c) => {
  const currentUser = getCurrentUser(c)
  const episodeId = Number(c.req.param('id'))
  const episode = await findOwnedEpisode(currentUser.id, episodeId)
  if (!episode) return notFound(c, 'Chapter not found')
  const links = await db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
    .all()
  const sceneIds = links.map((link) => link.sceneId)
  if (!sceneIds.length) return success(c, [])

  const allScenes = await db.select().from(schema.scenes).all()
  const result = allScenes.filter((scene) => sceneIds.includes(scene.id) && !scene.deletedAt)
  return success(c, toSnakeCaseArray(result.map(scene => ({
    ...scene,
    prompt: resolveSceneEnvironmentPrompt(scene.prompt, scene.location),
  }))))
})

// GET /chapters/:episode_id/storyboards
app.get('/:episode_id/storyboards', async (c) => {
  const currentUser = getCurrentUser(c)
  const episodeId = Number(c.req.param('episode_id'))
  const episode = await findOwnedEpisode(currentUser.id, episodeId)
  if (!episode) return notFound(c, 'Chapter not found')
  const rows = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const links = await db.select().from(schema.storyboardCharacters).all()
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const arr = charIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, arr)
  }

  const episodeCharIds = (await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .all())
    .map((link) => link.characterId)
  const allChars = (await db.select().from(schema.characters).all())
    .filter((character) => episodeCharIds.includes(character.id) && !character.deletedAt)
  const assetMap = await loadCharacterAssetMap(allChars)
  const dramaStyle = await loadEpisodeDramaStyle(episodeId)

  return success(c, rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: charIdsByStoryboard.get(row.id) || [],
    characters: allChars
      .filter((character) => (charIdsByStoryboard.get(row.id) || []).includes(character.id))
      .map((character) => presentCharacterWithAsset(character, assetMap, dramaStyle)),
  })))
})

// GET /chapters/:id/pipeline-status - production pipeline progress
app.get('/:id/pipeline-status', async (c) => {
  const currentUser = getCurrentUser(c)
  const episodeId = Number(c.req.param('id'))
  const ownedEpisode = await findOwnedEpisode(currentUser.id, episodeId)
  if (!ownedEpisode) return notFound(c, 'Chapter not found')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c, 'Chapter not found')

  const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
  const scenes = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, ep.dramaId)).all()
  const storyboards = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
  const merges = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId)).all()

  const storyboardsWithImage = storyboards.filter((storyboard) => storyboard.composedImage)
  const storyboardsWithVideo = storyboards.filter((storyboard) => storyboard.videoUrl)
  const storyboardsComposed = storyboards.filter((storyboard) => storyboard.composedVideoUrl)
  const latestMerge = merges[merges.length - 1]

  function stepStatus(done: boolean, partial?: boolean) {
    if (done) return 'done'
    if (partial) return 'partial'
    return 'pending'
  }

  return success(c, {
    episode_id: episodeId,
    steps: {
      script_rewrite: { status: ep.scriptContent ? 'done' : (ep.content ? 'ready' : 'pending') },
      extract_characters: { status: stepStatus(chars.length > 0), count: chars.length },
      extract_scenes: { status: stepStatus(scenes.length > 0), count: scenes.length },
      extract_storyboards: { status: stepStatus(storyboards.length > 0), count: storyboards.length },
      generate_images: {
        status: stepStatus(storyboardsWithImage.length === storyboards.length && storyboards.length > 0, storyboardsWithImage.length > 0),
        completed: storyboardsWithImage.length,
        total: storyboards.length,
      },
      generate_videos: {
        status: stepStatus(storyboardsWithVideo.length === storyboards.length && storyboards.length > 0, storyboardsWithVideo.length > 0),
        completed: storyboardsWithVideo.length,
        total: storyboards.length,
      },
      compose_shots: {
        status: stepStatus(storyboardsComposed.length === storyboards.length && storyboards.length > 0, storyboardsComposed.length > 0),
        completed: storyboardsComposed.length,
        total: storyboards.length,
      },
      merge_episode: {
        status: latestMerge?.status === 'completed' ? 'done' : (latestMerge ? latestMerge.status : 'pending'),
        merged_url: latestMerge?.mergedUrl,
      },
    },
  })
})

export default app
