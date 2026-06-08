import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { advance } from './episode-orchestrator.js'
import { computeVideoFailureDecision } from './automation-failure-policy.js'

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
      videoGenerationId?: number | null
      status: 'ok' | 'failed'
    }

export async function onResourceCompleted(input: ResourceHookInput): Promise<void> {
  const episodeId = await resolveEpisodeId(input)
  if (!episodeId) return
  const ep = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!ep.length || ep[0].automationStatus !== 'running') return
  if (input.type === 'video' && input.status === 'failed') {
    const shouldContinue = await recordAutomationVideoFailure(episodeId, ep[0], input.videoGenerationId)
    if (!shouldContinue) return
  }
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

async function recordAutomationVideoFailure(
  episodeId: number,
  episode: typeof schema.episodes.$inferSelect,
  videoGenerationId?: number | null,
): Promise<boolean> {
  const maxRetries = await loadMaxRetries()
  const errorMessage = await loadVideoGenerationError(videoGenerationId)
  const decision = computeVideoFailureDecision({
    status: episode.automationStatus,
    stage: episode.automationStage,
    attempt: episode.automationAttempt,
    maxRetries,
    errorMessage,
  })

  if (decision.type === 'ignore') return true

  const now = new Date().toISOString()
  if (decision.type === 'retry') {
    await db.update(schema.episodes)
      .set({
        automationAttempt: decision.nextAttempt,
        automationError: decision.error,
        updatedAt: now,
      })
      .where(eq(schema.episodes.id, episodeId))
      .run()
    return true
  }

  await db.update(schema.episodes)
    .set({
      automationStatus: 'failed',
      automationAttempt: decision.nextAttempt,
      automationError: decision.error,
      updatedAt: now,
    })
    .where(eq(schema.episodes.id, episodeId))
    .run()
  return false
}

async function loadMaxRetries(): Promise<number> {
  const rows = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, 'default'))
  return rows[0]?.autoPipelineMaxRetries ?? 2
}

async function loadVideoGenerationError(videoGenerationId?: number | null): Promise<string> {
  if (!videoGenerationId) return 'Video generation failed'
  const rows = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, videoGenerationId))
  return rows[0]?.errorMsg || 'Video generation failed'
}
