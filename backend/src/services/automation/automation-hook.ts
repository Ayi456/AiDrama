import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { advance } from './episode-orchestrator.js'

export type ResourceHookInput =
  | {
      type: 'image'
      storyboardId?: number | null
      characterId?: number | null
      sceneId?: number | null
      status: 'ok' | 'failed'
    }
  | {
      type: 'video'
      storyboardId?: number | null
      status: 'ok' | 'failed'
    }

export async function onResourceCompleted(input: ResourceHookInput): Promise<void> {
  const episodeId = await resolveEpisodeId(input)
  if (!episodeId) return
  const ep = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!ep.length || ep[0].automationStatus !== 'running') return
  void advance(episodeId).catch(err => console.warn('[automation] advance after hook failed', err))
}

export async function onMergeCompleted(input: { episodeId: number; status: 'ok' | 'failed' }): Promise<void> {
  const ep = await db.select().from(schema.episodes).where(eq(schema.episodes.id, input.episodeId))
  if (!ep.length || ep[0].automationStatus !== 'running') return
  void advance(input.episodeId).catch(err => console.warn('[automation] advance after merge hook failed', err))
}

async function resolveEpisodeId(input: ResourceHookInput): Promise<number | null> {
  if (input.storyboardId) {
    const r = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, input.storyboardId))
    return r[0]?.episodeId ?? null
  }
  if (input.type === 'image' && input.characterId) {
    const r = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.characterId, input.characterId))
    return r[0]?.episodeId ?? null
  }
  if (input.type === 'image' && input.sceneId) {
    const r = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.sceneId, input.sceneId))
    return r[0]?.episodeId ?? null
  }
  return null
}
