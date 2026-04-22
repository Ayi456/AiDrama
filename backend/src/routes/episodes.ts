import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, badRequest, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'

const app = new Hono()

// POST /episodes - Create a new episode
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id required')
  if (!body.image_config_id || !body.video_config_id) {
    return badRequest(c, 'image_config_id and video_config_id are required')
  }

  const ts = now()
  const existing = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, body.drama_id))
    .orderBy(schema.episodes.episodeNumber)
    .all()
  const nextNum = existing.length ? Math.max(...existing.map((episode) => episode.episodeNumber)) + 1 : 1

  const res = db.insert(schema.episodes).values({
    dramaId: body.drama_id,
    episodeNumber: nextNum,
    title: body.title || `第${nextNum}集`,
    imageConfigId: body.image_config_id,
    videoConfigId: body.video_config_id,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [ep] = db.select().from(schema.episodes)
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

// PUT /episodes/:id - Update episode fields
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  const allowed = ['content', 'script_content', 'title', 'description', 'status']
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) return badRequest(c, 'no valid fields')

  const drizzleUpdates: Record<string, any> = { updatedAt: now() }
  if ('content' in updates) drizzleUpdates.content = updates.content
  if ('script_content' in updates) drizzleUpdates.scriptContent = updates.script_content
  if ('title' in updates) drizzleUpdates.title = updates.title
  if ('description' in updates) drizzleUpdates.description = updates.description
  if ('status' in updates) drizzleUpdates.status = updates.status

  db.update(schema.episodes).set(drizzleUpdates).where(eq(schema.episodes.id, id)).run()
  return success(c)
})

// GET /episodes/:id/characters - characters linked to this episode
app.get('/:id/characters', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .all()
  const charIds = links.map((link) => link.characterId)
  if (!charIds.length) return success(c, [])

  const allChars = db.select().from(schema.characters).all()
  const result = allChars.filter((character) => charIds.includes(character.id) && !character.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:id/scenes - scenes linked to this episode
app.get('/:id/scenes', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
    .all()
  const sceneIds = links.map((link) => link.sceneId)
  if (!sceneIds.length) return success(c, [])

  const allScenes = db.select().from(schema.scenes).all()
  const result = allScenes.filter((scene) => sceneIds.includes(scene.id) && !scene.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:episode_id/storyboards
app.get('/:episode_id/storyboards', async (c) => {
  const episodeId = Number(c.req.param('episode_id'))
  const rows = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const links = db.select().from(schema.storyboardCharacters).all()
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const arr = charIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, arr)
  }

  const episodeCharIds = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .all()
    .map((link) => link.characterId)
  const allChars = db.select().from(schema.characters).all()
    .filter((character) => episodeCharIds.includes(character.id) && !character.deletedAt)

  return success(c, rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: charIdsByStoryboard.get(row.id) || [],
    characters: allChars
      .filter((character) => (charIdsByStoryboard.get(row.id) || []).includes(character.id))
      .map((character) => toSnakeCase(character)),
  })))
})

// GET /episodes/:id/pipeline-status - production pipeline progress
app.get('/:id/pipeline-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c, 'Episode not found')

  const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, ep.dramaId)).all()
  const storyboards = db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
  const merges = db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId)).all()

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
