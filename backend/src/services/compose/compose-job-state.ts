import { eq } from 'drizzle-orm'
import type * as dbSchema from '../../db/schema.js'

export type ComposeStoryboardRecord = {
  id: number
  storyboardNumber: number | null
  episodeId: number
  videoUrl?: string | null
}

export type ComposeStatePatch = Record<string, unknown>

type StoryboardUpdatePatch = Partial<typeof dbSchema.storyboards.$inferInsert>

export type ComposeJobPersistenceDeps = {
  loadStoryboard: (storyboardId: number) => Promise<ComposeStoryboardRecord | null>
  updateStoryboard: (storyboardId: number, patch: ComposeStatePatch) => Promise<void>
}

export function buildComposeProcessingPatch(updatedAt: string) {
  return {
    status: 'compose_processing' as const,
    composedVideoUrl: null,
    updatedAt,
  }
}

export function buildComposeFailurePatch(updatedAt: string) {
  return {
    status: 'compose_failed' as const,
    composedVideoUrl: null,
    updatedAt,
  }
}

export function buildComposeCompletionPatch(composedVideoUrl: string, updatedAt: string) {
  return {
    status: 'compose_completed' as const,
    composedVideoUrl,
    updatedAt,
  }
}

export function createComposeJobPersistence(deps: ComposeJobPersistenceDeps) {
  return {
    loadStoryboard: deps.loadStoryboard,
    markComposeProcessing: async (storyboardId: number, updatedAt: string) => {
      await deps.updateStoryboard(storyboardId, buildComposeProcessingPatch(updatedAt))
    },
    markComposeFailed: async (storyboardId: number, updatedAt: string) => {
      await deps.updateStoryboard(storyboardId, buildComposeFailurePatch(updatedAt))
    },
    completeStoryboardCompose: async (storyboardId: number, composedVideoUrl: string, updatedAt: string) => {
      await deps.updateStoryboard(storyboardId, buildComposeCompletionPatch(composedVideoUrl, updatedAt))
    },
  }
}

export function createComposeJobDbPersistence() {
  return createComposeJobPersistence({
    loadStoryboard: loadStoryboardFromDb,
    updateStoryboard: updateStoryboardInDb,
  })
}

async function loadStoryboardFromDb(storyboardId: number) {
  const { db, schema } = await import('../../db/index.js')
  const [storyboard] = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, storyboardId))
    .all()
  return storyboard || null
}

async function updateStoryboardInDb(storyboardId: number, patch: ComposeStatePatch) {
  const { db, schema } = await import('../../db/index.js')
  await db.update(schema.storyboards)
    .set(patch as StoryboardUpdatePatch)
    .where(eq(schema.storyboards.id, storyboardId))
    .run()
}
