import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, created, now, badRequest } from '../../utils/response.js'
import { toSnakeCase } from '../../utils/transform.js'
import { logTaskPayload, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import {
  buildStoryboardCreateLogContext,
  buildStoryboardCreateValues,
  buildStoryboardUpdatePatch,
  resolveStoryboardBindingInput,
  type StoryboardCreateBody,
  type StoryboardUpdateBody,
} from '../policies/storyboard-route-policy.js'

const app = new Hono()

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
  const body = await c.req.json() as StoryboardCreateBody
  const ts = now()

  logTaskStart('StoryboardAPI', 'create', buildStoryboardCreateLogContext(body))
  logTaskPayload('StoryboardAPI', 'create body', body)

  await validateStoryboardBindings(body.episode_id, body.scene_id, body.character_ids ?? undefined)
  const res = (await db.insert(schema.storyboards)
    .values(buildStoryboardCreateValues(body, ts))
    .run())

  await syncStoryboardCharacters(Number(res.lastInsertRowid), body.character_ids || [])
  const [result] = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid)))
    .all())

  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })

  return created(c, {
    ...toSnakeCase(result),
    character_ids: getStoryboardCharacterIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json() as StoryboardUpdateBody
  const [storyboard] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all())
  if (!storyboard) return badRequest(c, 'Storyboard not found')

  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const updates = buildStoryboardUpdatePatch(body, now())
  const bindingInput = resolveStoryboardBindingInput(
    body,
    storyboard,
    'character_ids' in body ? [] : await getStoryboardCharacterIds(id),
  )

  await validateStoryboardBindings(
    storyboard.episodeId,
    bindingInput.sceneId,
    bindingInput.characterIds,
  )

  await db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  if ('character_ids' in body) await syncStoryboardCharacters(id, body.character_ids || [])

  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
  })
  return success(c)
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  await db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).run()
  await db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
