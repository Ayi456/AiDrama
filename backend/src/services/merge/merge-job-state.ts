import { eq } from 'drizzle-orm'
import type * as dbSchema from '../../db/schema.js'
import type { TransitionConfig } from './merge-transition-policy.js'

export type MergeStoryboardForRecord = {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
  mergeVideoUrl: string
}

export type BuildEpisodeMergeRecordInput = {
  episodeId: number
  dramaId: number
  createdAt: string
  storyboards: MergeStoryboardForRecord[]
  transition?: TransitionConfig | null
}

export type MergeCompletionPatchInput = {
  mergedUrl: string
  duration: number
  completedAt: string
}

export type CompleteEpisodeMergeInput = MergeCompletionPatchInput & {
  mergeId: number
  episodeId: number
  episodeUpdatedAt: string
}

export type MergeStatePatch = Record<string, unknown>
export type PreviousEpisodeMergeRecord = Pick<typeof dbSchema.videoMerges.$inferSelect, 'id' | 'mergedUrl'>
export type EpisodeStoryboardRecord = {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
}

type VideoMergeUpdatePatch = Partial<typeof dbSchema.videoMerges.$inferInsert>
type EpisodeUpdatePatch = Partial<typeof dbSchema.episodes.$inferInsert>

export type MergeJobPersistenceDeps = {
  loadEpisodeStoryboards: (episodeId: number) => Promise<EpisodeStoryboardRecord[]>
  loadPreviousEpisodeMerges: (episodeId: number) => Promise<PreviousEpisodeMergeRecord[]>
  updateEpisodeMerges: (episodeId: number, patch: MergeStatePatch) => Promise<void>
  updateEpisode: (episodeId: number, patch: MergeStatePatch) => Promise<void>
  insertVideoMerge: (record: ReturnType<typeof buildEpisodeMergeRecord>) => Promise<number>
  updateVideoMerge: (mergeId: number, patch: MergeStatePatch) => Promise<void>
}

export function buildEpisodeMergeRecord(input: BuildEpisodeMergeRecordInput) {
  return {
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    title: `Episode ${input.episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-copy-fallback-transcode',
    status: 'processing' as const,
    scenes: JSON.stringify(input.storyboards.map(storyboard => ({
      storyboardId: storyboard.id,
      storyboardNumber: storyboard.storyboardNumber,
      videoUrl: storyboard.mergeVideoUrl,
      source: storyboard.videoUrl ? 'storyboard' : 'composed',
    }))),
    transitionType: input.transition?.type ?? null,
    transitionDurationMs: input.transition?.durationMs ?? null,
    createdAt: input.createdAt,
  }
}

export function buildReplacedMergePatch(deletedAt: string) {
  return {
    status: 'replaced' as const,
    mergedUrl: null,
    deletedAt,
  }
}

export function buildEpisodeVideoClearPatch(updatedAt: string) {
  return {
    videoUrl: null,
    updatedAt,
  }
}

export function buildMergeCompletionPatch(input: MergeCompletionPatchInput) {
  return {
    status: 'completed' as const,
    mergedUrl: input.mergedUrl,
    duration: input.duration,
    completedAt: input.completedAt,
  }
}

export function buildEpisodeVideoCompletionPatch(videoUrl: string, updatedAt: string) {
  return {
    videoUrl,
    updatedAt,
  }
}

export function normalizeMergeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function buildMergeFailurePatch(error: unknown) {
  return {
    status: 'failed' as const,
    errorMsg: normalizeMergeErrorMessage(error),
  }
}

export function createMergeJobPersistence(deps: MergeJobPersistenceDeps) {
  return {
    loadEpisodeStoryboards: deps.loadEpisodeStoryboards,
    loadPreviousEpisodeMerges: deps.loadPreviousEpisodeMerges,
    replaceEpisodeMerges: async (episodeId: number, deletedAt: string) => {
      await deps.updateEpisodeMerges(episodeId, buildReplacedMergePatch(deletedAt))
    },
    clearEpisodeVideo: async (episodeId: number, updatedAt: string) => {
      await deps.updateEpisode(episodeId, buildEpisodeVideoClearPatch(updatedAt))
    },
    createEpisodeMergeRecord: async (input: BuildEpisodeMergeRecordInput) => {
      return await deps.insertVideoMerge(buildEpisodeMergeRecord(input))
    },
    recordMergeFailure: async (mergeId: number, error: unknown) => {
      await deps.updateVideoMerge(mergeId, buildMergeFailurePatch(error))
    },
    completeEpisodeMerge: async (input: CompleteEpisodeMergeInput) => {
      await deps.updateVideoMerge(input.mergeId, buildMergeCompletionPatch(input))
      await deps.updateEpisode(input.episodeId, buildEpisodeVideoCompletionPatch(input.mergedUrl, input.episodeUpdatedAt))
    },
  }
}

export function createMergeJobDbPersistence() {
  return createMergeJobPersistence({
    loadEpisodeStoryboards: loadEpisodeStoryboardsFromDb,
    loadPreviousEpisodeMerges: loadPreviousEpisodeMergesFromDb,
    updateEpisodeMerges: updateEpisodeMergesInDb,
    updateEpisode: updateEpisodeInDb,
    insertVideoMerge: insertVideoMergeInDb,
    updateVideoMerge: updateVideoMergeInDb,
  })
}

async function loadEpisodeStoryboardsFromDb(episodeId: number) {
  const { db, schema } = await import('../../db/index.js')
  return await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
}

async function loadPreviousEpisodeMergesFromDb(episodeId: number) {
  const { db, schema } = await import('../../db/index.js')
  return await db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all()
}

async function updateEpisodeMergesInDb(episodeId: number, patch: MergeStatePatch) {
  const { db, schema } = await import('../../db/index.js')
  await db.update(schema.videoMerges)
    .set(patch as VideoMergeUpdatePatch)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .run()
}

async function updateEpisodeInDb(episodeId: number, patch: MergeStatePatch) {
  const { db, schema } = await import('../../db/index.js')
  await db.update(schema.episodes)
    .set(patch as EpisodeUpdatePatch)
    .where(eq(schema.episodes.id, episodeId))
    .run()
}

async function insertVideoMergeInDb(record: ReturnType<typeof buildEpisodeMergeRecord>) {
  const { db, schema } = await import('../../db/index.js')
  const result = await db.insert(schema.videoMerges)
    .values(record)
    .run()
  return Number(result.lastInsertRowid)
}

async function updateVideoMergeInDb(mergeId: number, patch: MergeStatePatch) {
  const { db, schema } = await import('../../db/index.js')
  await db.update(schema.videoMerges)
    .set(patch as VideoMergeUpdatePatch)
    .where(eq(schema.videoMerges.id, mergeId))
    .run()
}
