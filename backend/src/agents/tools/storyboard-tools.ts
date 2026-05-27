import { createTool } from '@mastra/core/tools'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { appendDialogueToVideoPrompt } from '../../routes/policies/storyboard-route-policy.js'
import {
  mergeStoryboardCharacterIds,
  mergeStoryboardInputCharacterIds,
  type StoryboardCharacterBindingSource,
  type StoryboardCharacterCandidate,
} from '../../routes/policies/storyboard-character-binding-policy.js'
import {
  getNextStoryboardNumber,
  renumberStoryboardsForAppend,
  type StoryboardChunk,
} from '../storyboard-chunks.js'
import { buildVisualGridPromptPlan } from '../visual-prompt-policy.js'

type StoryboardToolOptions = {
  scriptChunk?: StoryboardChunk
  appendMode?: boolean
  clearBeforeAppend?: boolean
}

const storyboardInputSchema = z.object({
  storyboards: z.array(z.object({
    shot_number: z.number(),
    title: z.string().optional(),
    shot_type: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    location: z.string().optional(),
    time: z.string().optional(),
    action: z.string().optional(),
    dialogue: z.string().optional(),
    description: z.string().optional(),
    result: z.string().optional(),
    atmosphere: z.string().optional(),
    image_prompt: z.string().optional(),
    video_prompt: z.string().optional(),
    bgm_prompt: z.string().optional(),
    sound_effect: z.string().optional(),
    duration: z.number().optional(),
    scene_id: z.number().nullable().optional(),
    character_ids: z.array(z.number()).optional(),
  })).min(1),
})

type StoryboardInput = z.infer<typeof storyboardInputSchema>['storyboards'][number]
type StoryboardUpdateValues = Partial<typeof schema.storyboards.$inferInsert>
type StoryboardRow = typeof schema.storyboards.$inferSelect

async function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  await db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set(characterIds.filter(Boolean))]
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
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all())
    .map(link => link.characterId)
}

async function getEpisodeSceneIds(episodeId: number) {
  return new Set(
    (await db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId)).all())
      .map(link => link.sceneId),
  )
}

async function getEpisodeCharacterIds(episodeId: number) {
  return new Set(
    (await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all())
      .map(link => link.characterId),
  )
}

async function getEpisodeCharacterCandidates(
  episodeId: number,
  dramaId: number,
): Promise<StoryboardCharacterCandidate[]> {
  const linkedCharacterIds = new Set(
    (await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all())
      .map(link => link.characterId),
  )
  if (!linkedCharacterIds.size) return []

  return (await db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId)).all())
    .filter(character => !character.deletedAt)
    .filter(character => linkedCharacterIds.has(character.id))
    .map(character => ({
      id: character.id,
      name: character.name,
    }))
}

async function validateStoryboardBindings(
  episodeId: number,
  sceneId: number | null | undefined,
  characterIds: number[] | undefined,
) {
  const episodeSceneIds = await getEpisodeSceneIds(episodeId)
  const episodeCharacterIds = await getEpisodeCharacterIds(episodeId)

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error(`scene_id ${sceneId} is not linked to episode ${episodeId}`)
  }

  const invalidCharacterIds = (characterIds || []).filter(id => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error(`character_ids are not linked to episode ${episodeId}: ${invalidCharacterIds.join(', ')}`)
  }
}

async function clearExistingStoryboards(episodeId: number) {
  const existingStoryboardIds = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all())
    .map(storyboard => storyboard.id)

  for (const storyboardId of existingStoryboardIds) {
    await db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  await db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()
  return existingStoryboardIds.length
}

function buildStoryboardUpdateBindingSource(
  fields: Partial<StoryboardInput>,
  storyboard: StoryboardRow,
): StoryboardCharacterBindingSource {
  return {
    title: 'title' in fields ? fields.title : storyboard.title,
    description: 'description' in fields ? fields.description : storyboard.description,
    action: 'action' in fields ? fields.action : storyboard.action,
    dialogue: 'dialogue' in fields ? fields.dialogue : storyboard.dialogue,
    result: 'result' in fields ? fields.result : storyboard.result,
    atmosphere: 'atmosphere' in fields ? fields.atmosphere : storyboard.atmosphere,
    image_prompt: 'image_prompt' in fields ? fields.image_prompt : storyboard.imagePrompt,
    video_prompt: 'video_prompt' in fields ? fields.video_prompt : storyboard.videoPrompt,
  }
}

function sameCharacterIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

async function insertStoryboards(episodeId: number, dramaId: number, storyboards: StoryboardInput[]) {
  const ts = now()
  let totalDuration = 0
  const characterCandidates = await getEpisodeCharacterCandidates(episodeId, dramaId)

  for (const storyboard of storyboards) {
    const characterIds = mergeStoryboardInputCharacterIds(storyboard, characterCandidates)
    await validateStoryboardBindings(episodeId, storyboard.scene_id, characterIds)
    const duration = storyboard.duration || 10
    const res = (await db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber: storyboard.shot_number,
      title: storyboard.title,
      shotType: storyboard.shot_type,
      angle: storyboard.angle,
      movement: storyboard.movement,
      location: storyboard.location,
      time: storyboard.time,
      action: storyboard.action,
      dialogue: storyboard.dialogue,
      description: storyboard.description,
      result: storyboard.result,
      atmosphere: storyboard.atmosphere,
      imagePrompt: storyboard.image_prompt,
      videoPrompt: appendDialogueToVideoPrompt(storyboard.video_prompt, storyboard.dialogue) || undefined,
      bgmPrompt: storyboard.bgm_prompt,
      soundEffect: storyboard.sound_effect,
      sceneId: storyboard.scene_id,
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run())
    await syncStoryboardCharacters(Number(res.lastInsertRowid), characterIds)
    totalDuration += duration
  }

  return totalDuration
}

async function updateEpisodeDurationFromStoryboards(episodeId: number) {
  const storyboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all())
    .filter(storyboard => !storyboard.deletedAt)
  const totalDuration = storyboards.reduce((sum, storyboard) => sum + (storyboard.duration || 10), 0)
  await db.update(schema.episodes)
    .set({ duration: Math.ceil(totalDuration / 60), updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()
  return totalDuration
}

async function buildExistingStoryboardPayload(episodeId: number) {
  const existingStoryboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all())

  return Promise.all(existingStoryboards
    .filter(storyboard => !storyboard.deletedAt)
    .map(async storyboard => ({
      id: storyboard.id,
      shot_number: storyboard.storyboardNumber,
      title: storyboard.title || '',
      scene_id: storyboard.sceneId,
      character_ids: (await db.select().from(schema.storyboardCharacters)
        .where(eq(schema.storyboardCharacters.storyboardId, storyboard.id)).all())
        .map(link => link.characterId),
      shot_type: storyboard.shotType || '',
      duration: storyboard.duration || 0,
    })))
}

export function createStoryboardTools(episodeId: number, dramaId: number, options: StoryboardToolOptions = {}) {
  const readStoryboardContext = createTool({
    id: 'read_storyboard_context',
    description: 'Read AiDrama screenplay, character, scene, project style, and existing storyboard context.',
    inputSchema: z.object({}),
    execute: async () => {
      const [episode] = (await db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all())
      if (!episode) return { error: 'Episode not found' }
      const [drama] = (await db.select().from(schema.dramas)
        .where(eq(schema.dramas.id, dramaId)).all())
      const fullScript = episode.scriptContent || episode.content
      if (!fullScript) return { error: 'Episode has no script' }
      const script = options.scriptChunk?.script || fullScript

      const charLinks = (await db.select().from(schema.episodeCharacters)
        .where(eq(schema.episodeCharacters.episodeId, episodeId)).all())
      const sceneLinks = (await db.select().from(schema.episodeScenes)
        .where(eq(schema.episodeScenes.episodeId, episodeId)).all())

      const linkedCharacterIds = new Set(charLinks.map(link => link.characterId))
      const linkedSceneIds = new Set(sceneLinks.map(link => link.sceneId))

      const chars = (await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all())
      const scns = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all())
      const existingStoryboards = await buildExistingStoryboardPayload(episodeId)

      const characters = chars
        .filter(character => !character.deletedAt)
        .filter(character => !linkedCharacterIds.size || linkedCharacterIds.has(character.id))
        .map(character => ({
          id: character.id,
          name: character.name,
          role: character.role || '',
          description: character.description || '',
          appearance: character.appearance || '',
          personality: character.personality || '',
          image_url: character.imageUrl || '',
          reference_images: character.referenceImages || '',
        }))

      const scenes = scns
        .filter(scene => !scene.deletedAt)
        .filter(scene => !linkedSceneIds.size || linkedSceneIds.has(scene.id))
        .map(scene => ({
          id: scene.id,
          location: scene.location,
          time: scene.time,
          prompt: scene.prompt || '',
          image_url: scene.imageUrl || '',
          storyboard_count: scene.storyboardCount || 0,
        }))

      const payload = {
        project: {
          id: dramaId,
          title: drama?.title || '',
          style: drama?.style || '',
        },
        episode: {
          id: episode.id,
          title: episode.title,
          episode_number: episode.episodeNumber,
          description: episode.description || '',
        },
        script,
        chunk: options.scriptChunk
          ? {
              index: options.scriptChunk.index,
              total: options.scriptChunk.total,
              is_chunked: true,
              full_script_length: fullScript.length,
              chunk_script_length: script.length,
            }
          : null,
        characters,
        scenes,
        existing_storyboards: existingStoryboards,
      }

      logTaskSuccess('StoryboardTool', 'read-context', {
        episodeId,
        dramaId,
        characters: characters.length,
        scenes: scenes.length,
        existingStoryboards: payload.existing_storyboards.length,
        scriptLength: fullScript.length,
        chunkIndex: options.scriptChunk?.index,
        chunkTotal: options.scriptChunk?.total,
        chunkScriptLength: script.length,
      })
      return payload
    },
  })

  const saveStoryboards = createTool({
    id: 'save_storyboards',
    description: 'Save generated storyboards and replace all existing storyboards for this episode.',
    inputSchema: storyboardInputSchema,
    execute: async ({ storyboards }) => {
      logTaskProgress('StoryboardTool', 'save-begin', {
        episodeId,
        dramaId,
        count: storyboards.length,
        shotNumbers: storyboards.map(storyboard => storyboard.shot_number).join(','),
      })
      await clearExistingStoryboards(episodeId)

      await insertStoryboards(episodeId, dramaId, storyboards)
      const totalDuration = await updateEpisodeDurationFromStoryboards(episodeId)

      logTaskSuccess('StoryboardTool', 'save-complete', {
        episodeId,
        count: storyboards.length,
        totalDuration,
      })
      return { message: `Saved ${storyboards.length} storyboards`, count: storyboards.length, total_duration: totalDuration }
    },
  })

  const appendStoryboards = createTool({
    id: 'append_storyboards',
    description: 'Append generated storyboards for the current script chunk and continue shot numbering.',
    inputSchema: storyboardInputSchema,
    execute: async ({ storyboards }) => {
      const deletedStoryboards = options.clearBeforeAppend
        ? await clearExistingStoryboards(episodeId)
        : 0
      const existingStoryboards = (await db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.episodeId, episodeId)).all())
        .filter(storyboard => !storyboard.deletedAt)
      const startNumber = getNextStoryboardNumber(existingStoryboards)
      const renumberedStoryboards = renumberStoryboardsForAppend(storyboards, startNumber)

      logTaskProgress('StoryboardTool', 'append-begin', {
        episodeId,
        dramaId,
        chunkIndex: options.scriptChunk?.index,
        chunkTotal: options.scriptChunk?.total,
        count: renumberedStoryboards.length,
        startNumber,
        deletedStoryboards,
        shotNumbers: renumberedStoryboards.map(storyboard => storyboard.shot_number).join(','),
      })

      await insertStoryboards(episodeId, dramaId, renumberedStoryboards)
      const totalDuration = await updateEpisodeDurationFromStoryboards(episodeId)

      logTaskSuccess('StoryboardTool', 'append-complete', {
        episodeId,
        chunkIndex: options.scriptChunk?.index,
        count: renumberedStoryboards.length,
        totalDuration,
      })
      return {
        message: `Appended ${renumberedStoryboards.length} storyboards`,
        count: renumberedStoryboards.length,
        start_number: startNumber,
        total_duration: totalDuration,
      }
    },
  })

  const updateStoryboard = createTool({
    id: 'update_storyboard',
    description: 'Update a specific AiDrama storyboard shot.',
    inputSchema: z.object({
      storyboard_id: z.number(),
      title: z.string().optional(),
      shot_type: z.string().optional(),
      angle: z.string().optional(),
      movement: z.string().optional(),
      location: z.string().optional(),
      time: z.string().optional(),
      action: z.string().optional(),
      result: z.string().optional(),
      atmosphere: z.string().optional(),
      image_prompt: z.string().optional(),
      video_prompt: z.string().optional(),
      bgm_prompt: z.string().optional(),
      sound_effect: z.string().optional(),
      description: z.string().optional(),
      dialogue: z.string().optional(),
      scene_id: z.number().nullable().optional(),
      character_ids: z.array(z.number()).optional(),
      duration: z.number().optional(),
    }),
    execute: async ({ storyboard_id, ...fields }) => {
      const [storyboard] = (await db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.id, storyboard_id)).all())
      if (!storyboard) return { error: `Storyboard ${storyboard_id} not found` }

      logTaskProgress('StoryboardTool', 'update-begin', {
        episodeId,
        storyboardId: storyboard_id,
        fields: Object.keys(fields),
      })

      const currentCharacterIds = await getStoryboardCharacterIds(storyboard_id)
      const characterIds = mergeStoryboardCharacterIds(
        'character_ids' in fields ? fields.character_ids : currentCharacterIds,
        buildStoryboardUpdateBindingSource(fields, storyboard),
        await getEpisodeCharacterCandidates(episodeId, dramaId),
      )

      await validateStoryboardBindings(
        episodeId,
        'scene_id' in fields ? fields.scene_id : storyboard.sceneId,
        characterIds,
      )

      const updates: StoryboardUpdateValues = { updatedAt: now() }
      if ('title' in fields) updates.title = fields.title
      if ('shot_type' in fields) updates.shotType = fields.shot_type
      if ('angle' in fields) updates.angle = fields.angle
      if ('movement' in fields) updates.movement = fields.movement
      if ('location' in fields) updates.location = fields.location
      if ('time' in fields) updates.time = fields.time
      if ('action' in fields) updates.action = fields.action
      if ('result' in fields) updates.result = fields.result
      if ('atmosphere' in fields) updates.atmosphere = fields.atmosphere
      if ('image_prompt' in fields) updates.imagePrompt = fields.image_prompt
      if ('video_prompt' in fields) {
        updates.videoPrompt = appendDialogueToVideoPrompt(
          fields.video_prompt,
          'dialogue' in fields ? fields.dialogue : storyboard.dialogue,
        )
      }
      if ('bgm_prompt' in fields) updates.bgmPrompt = fields.bgm_prompt
      if ('sound_effect' in fields) updates.soundEffect = fields.sound_effect
      if ('description' in fields) updates.description = fields.description
      if ('dialogue' in fields) updates.dialogue = fields.dialogue
      if ('dialogue' in fields && !('video_prompt' in fields) && storyboard.videoPrompt) {
        updates.videoPrompt = appendDialogueToVideoPrompt(storyboard.videoPrompt, fields.dialogue)
      }
      if ('scene_id' in fields) updates.sceneId = fields.scene_id
      if ('duration' in fields) updates.duration = fields.duration

      await db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, storyboard_id)).run()
      if ('character_ids' in fields || !sameCharacterIds(characterIds, currentCharacterIds)) {
        await syncStoryboardCharacters(storyboard_id, characterIds)
      }

      logTaskSuccess('StoryboardTool', 'update-complete', {
        episodeId,
        storyboardId: storyboard_id,
        updatedFields: Object.keys(updates),
        characterIds: characterIds.join(','),
      })
      return { message: `Storyboard ${storyboard_id} updated` }
    },
  })

  const generateGridPrompt = createTool({
    id: 'generate_grid_prompt',
    description: 'Generate an AiDrama grid prompt plan from selected storyboard shots.',
    inputSchema: z.object({
      shots: z.array(z.object({
        shot_number: z.number(),
        description: z.string(),
        shot_type: z.string().optional(),
        dialogue: z.string().optional(),
      })),
      rows: z.number(),
      cols: z.number(),
      mode: z.string(),
    }),
    execute: async ({ shots, rows, cols, mode }) => {
      if (!shots.length) return { error: 'No shots provided' }
      logTaskProgress('StoryboardTool', 'grid-prompt-begin', {
        episodeId,
        shots: shots.length,
        rows,
        cols,
        mode,
      })

      const payload = buildVisualGridPromptPlan({ shots, rows, cols, mode })
      logTaskSuccess('StoryboardTool', 'grid-prompt-complete', {
        episodeId,
        cells: payload.cell_prompts.length,
        mode,
      })
      return payload
    },
  })

  if (options.appendMode) {
    return { readStoryboardContext, appendStoryboards, updateStoryboard, generateGridPrompt }
  }

  return { readStoryboardContext, saveStoryboards, appendStoryboards, updateStoryboard, generateGridPrompt }
}
