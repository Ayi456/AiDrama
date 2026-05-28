import { createTool } from '@mastra/core/tools'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import {
  buildCharacterImagePrompt,
  buildSceneImagePrompt,
  buildVisualGridPromptPlan,
  resolveSceneEnvironmentPrompt,
} from '../visual-prompt-policy.js'

export function createGridPromptTools(episodeId: number, dramaId: number) {
  async function getDramaStyle() {
    const [drama] = (await db.select().from(schema.dramas)
      .where(eq(schema.dramas.id, dramaId)).all())
    return drama?.style || ''
  }

  const readCharacters = createTool({
    id: 'read_characters',
    description: 'Read AiDrama character assets for visual prompt generation.',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = (await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all())
        .filter(character => !character.deletedAt)
      return {
        characters: chars.map(character => ({
          id: character.id,
          name: character.name,
          role: character.role || '',
          description: character.description || '',
          appearance: character.appearance || '',
          personality: character.personality || '',
        })),
      }
    },
  })

  const generateCharacterPrompt = createTool({
    id: 'generate_character_prompt',
    description: 'Generate an English image prompt for one AiDrama character.',
    inputSchema: z.object({
      character_id: z.number(),
    }),
    execute: async ({ character_id }) => {
      const [character] = (await db.select().from(schema.characters)
        .where(eq(schema.characters.id, character_id)).all())
      if (!character) return { error: 'Character not found' }
      const style = await getDramaStyle()

      return {
        character_id: character.id,
        character_name: character.name,
        prompt: buildCharacterImagePrompt({ ...character, style }),
      }
    },
  })

  const readScenes = createTool({
    id: 'read_scenes',
    description: 'Read AiDrama scene assets for visual prompt generation.',
    inputSchema: z.object({}),
    execute: async () => {
      const scenes = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all())
        .filter(scene => !scene.deletedAt)
      return {
        scenes: scenes.map(scene => ({
          id: scene.id,
          location: scene.location,
          time: scene.time || '',
          prompt: resolveSceneEnvironmentPrompt(scene.prompt, scene.location),
        })),
      }
    },
  })

  const generateScenePrompt = createTool({
    id: 'generate_scene_prompt',
    description: 'Generate a Chinese image prompt for one AiDrama scene.',
    inputSchema: z.object({
      scene_id: z.number(),
    }),
    execute: async ({ scene_id }) => {
      const [scene] = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.id, scene_id)).all())
      if (!scene) return { error: 'Scene not found' }
      const style = await getDramaStyle()

      return {
        scene_id: scene.id,
        location: scene.location,
        prompt: buildSceneImagePrompt({ ...scene, style }),
      }
    },
  })

  const readShotsForGrid = createTool({
    id: 'read_shots_for_grid',
    description: 'Read selected storyboard shots for AiDrama grid prompt planning.',
    inputSchema: z.object({
      shot_ids: z.array(z.number()),
    }),
    execute: async ({ shot_ids }) => {
      if (!shot_ids.length) return { shots: [] }
      const shots = (await db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.episodeId, episodeId)).all())
        .filter(storyboard => shot_ids.includes(storyboard.id))
        .map(storyboard => ({
          shot_number: storyboard.storyboardNumber,
          description: storyboard.description || storyboard.title || '',
          shot_type: storyboard.shotType || '',
          dialogue: storyboard.dialogue || '',
          location: storyboard.location || '',
          time: storyboard.time || '',
        }))
      return { shots }
    },
  })

  const generateGridPrompt = createTool({
    id: 'generate_grid_prompt',
    description: 'Generate an AiDrama grid prompt plan with one overall prompt and per-panel prompts.',
    inputSchema: z.object({
      shots: z.array(z.object({
        shot_number: z.number(),
        description: z.string(),
        shot_type: z.string().optional(),
        dialogue: z.string().optional(),
        location: z.string().optional(),
        time: z.string().optional(),
      })),
      rows: z.number(),
      cols: z.number(),
      mode: z.string(),
      reference_legend: z.string().optional(),
    }),
    execute: async ({ shots, rows, cols, mode, reference_legend }) => {
      if (!shots.length) return { error: 'No shots provided', grid_prompt: '', cell_prompts: [] }
      return buildVisualGridPromptPlan({
        shots,
        rows,
        cols,
        mode,
        referenceLegend: reference_legend,
      })
    },
  })

  return {
    readCharacters,
    generateCharacterPrompt,
    readScenes,
    generateScenePrompt,
    readShotsForGrid,
    generateGridPrompt,
  }
}
