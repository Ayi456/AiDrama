import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, now, badRequest } from '../../utils/response.js'
import { toSnakeCase } from '../../utils/transform.js'
import { logTaskPayload, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import {
  mergeStoryboardCharacterIds,
  mergeStoryboardInputCharacterIds,
  type StoryboardCharacterBindingSource,
  type StoryboardCharacterCandidate,
} from '../policies/storyboard-character-binding-policy.js'
import {
  buildStoryboardCreateLogContext,
  buildStoryboardCreateValues,
  buildStoryboardUpdatePatch,
  resolveStoryboardBindingInput,
  type StoryboardCreateBody,
  type StoryboardUpdateBody,
} from '../policies/storyboard-route-policy.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { findOwnedEpisode, findOwnedStoryboard } from '../shared/ownership.js'

const app = new Hono()
type StoryboardRow = typeof schema.storyboards.$inferSelect

async function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  await db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    await db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    }).run()
  }
}

async function getStoryboardCharacterIds(storyboardId: number) {
  return (await db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .all())
    .map((link) => link.characterId)
}

async function getEpisodeCharacterCandidates(episodeId: number): Promise<StoryboardCharacterCandidate[]> {
  const linkedCharacterIds = new Set(
    (await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all())
      .map((link) => link.characterId),
  )
  if (!linkedCharacterIds.size) return []

  return (await db.select().from(schema.characters).all())
    .filter((character) => !character.deletedAt)
    .filter((character) => linkedCharacterIds.has(character.id))
    .map((character) => ({
      id: character.id,
      name: character.name,
    }))
}

function buildStoryboardUpdateBindingSource(
  body: StoryboardUpdateBody,
  storyboard: StoryboardRow,
): StoryboardCharacterBindingSource {
  return {
    title: 'title' in body ? body.title : storyboard.title,
    description: 'description' in body ? body.description : storyboard.description,
    action: 'action' in body ? body.action : storyboard.action,
    dialogue: 'dialogue' in body ? body.dialogue : storyboard.dialogue,
    result: 'result' in body ? body.result : storyboard.result,
    atmosphere: 'atmosphere' in body ? body.atmosphere : storyboard.atmosphere,
    image_prompt: 'image_prompt' in body ? body.image_prompt : storyboard.imagePrompt,
    video_prompt: 'video_prompt' in body ? body.video_prompt : storyboard.videoPrompt,
  }
}

function sameCharacterIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

async function validateStoryboardBindings(episodeId: number, sceneId: number | null | undefined, characterIds: number[] | undefined) {
  const episodeSceneIds = new Set(
    (await db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
      .all())
      .map((link) => link.sceneId),
  )
  const episodeCharacterIds = new Set(
    (await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
      .all())
      .map((link) => link.characterId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id must come from the current episode scenes')
  }

  const invalidCharacterIds = (characterIds || []).filter((id) => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error('character_ids must come from the current episode characters')
  }
}

// POST /storyboards
app.post('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await c.req.json() as StoryboardCreateBody
  const episode = await findOwnedEpisode(currentUser.id, Number(body.episode_id))
  if (!episode) return badRequest(c, 'Episode not found')
  const ts = now()

  logTaskStart('StoryboardAPI', 'create', buildStoryboardCreateLogContext(body))
  logTaskPayload('StoryboardAPI', 'create body', body)

  const characterIds = mergeStoryboardInputCharacterIds(
    body,
    await getEpisodeCharacterCandidates(body.episode_id),
  )

  await validateStoryboardBindings(body.episode_id, body.scene_id, characterIds)
  const res = (await db.insert(schema.storyboards)
    .values(buildStoryboardCreateValues(body, ts))
    .run())

  await syncStoryboardCharacters(Number(res.lastInsertRowid), characterIds)
  const [result] = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid)))
    .all())

  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
    characterIds,
  })

  return created(c, {
    ...toSnakeCase(result),
    character_ids: getStoryboardCharacterIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const body = await c.req.json() as StoryboardUpdateBody
  const storyboard = await findOwnedStoryboard(currentUser.id, id)
  if (!storyboard) return badRequest(c, 'Storyboard not found')

  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const updates = buildStoryboardUpdatePatch(body, now())
  const currentCharacterIds = await getStoryboardCharacterIds(id)
  const bindingInput = resolveStoryboardBindingInput(
    body,
    storyboard,
    currentCharacterIds,
  )
  const characterIds = mergeStoryboardCharacterIds(
    bindingInput.characterIds,
    buildStoryboardUpdateBindingSource(body, storyboard),
    await getEpisodeCharacterCandidates(storyboard.episodeId),
  )

  await validateStoryboardBindings(
    storyboard.episodeId,
    bindingInput.sceneId,
    characterIds,
  )

  await db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  if ('character_ids' in body || !sameCharacterIds(characterIds, currentCharacterIds)) {
    await syncStoryboardCharacters(id, characterIds)
  }

  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds,
  })
  return success(c)
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const currentUser = getCurrentUser(c)
  const id = Number(c.req.param('id'))
  const storyboard = await findOwnedStoryboard(currentUser.id, id)
  if (!storyboard) return badRequest(c, 'Storyboard not found')
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  await db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).run()
  await db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
