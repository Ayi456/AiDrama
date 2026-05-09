import { eq } from 'drizzle-orm'
import type * as dbSchema from '../../../db/schema.js'
import { createMediaJobSnapshotPersistor } from '../job/media-job-state.js'

export type MediaGenerationPatch = Record<string, unknown>

type ImageGenerationDbPatch = Partial<typeof dbSchema.imageGenerations.$inferInsert>
type VideoGenerationDbPatch = Partial<typeof dbSchema.videoGenerations.$inferInsert>
type StoryboardDbPatch = Partial<typeof dbSchema.storyboards.$inferInsert>
type CharacterDbPatch = Partial<typeof dbSchema.characters.$inferInsert>
type SceneDbPatch = Partial<typeof dbSchema.scenes.$inferInsert>

export type MediaGenerationPersistenceDeps = {
  persistImageGenerationPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  persistVideoGenerationPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishStoryboardPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishCharacterPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishScenePatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
}

export function createImageGenerationPersistence(id: number, deps: MediaGenerationPersistenceDeps) {
  return {
    persistSnapshot: createMediaJobSnapshotPersistor({
      persistPatch: patch => deps.persistImageGenerationPatch(id, patch),
    }),
    persistProcessing: (patch: MediaGenerationPatch) => deps.persistImageGenerationPatch(id, patch),
    persistFailure: (patch: MediaGenerationPatch) => deps.persistImageGenerationPatch(id, patch),
    persistImageCompletion: (patch: MediaGenerationPatch) => deps.persistImageGenerationPatch(id, patch),
    publishStoryboardImage: deps.publishStoryboardPatch,
    publishCharacterImage: deps.publishCharacterPatch,
    publishSceneImage: deps.publishScenePatch,
  }
}

export function createVideoGenerationPersistence(id: number, deps: MediaGenerationPersistenceDeps) {
  return {
    persistSnapshot: createMediaJobSnapshotPersistor({
      persistPatch: patch => deps.persistVideoGenerationPatch(id, patch),
    }),
    persistProcessing: (patch: MediaGenerationPatch) => deps.persistVideoGenerationPatch(id, patch),
    persistFailure: (patch: MediaGenerationPatch) => deps.persistVideoGenerationPatch(id, patch),
    persistVideoCompletion: (patch: MediaGenerationPatch) => deps.persistVideoGenerationPatch(id, patch),
    publishStoryboardVideo: deps.publishStoryboardPatch,
  }
}

export function createImageGenerationDbPersistence(id: number) {
  return createImageGenerationPersistence(id, mediaGenerationDbPersistenceDeps)
}

export function createVideoGenerationDbPersistence(id: number) {
  return createVideoGenerationPersistence(id, mediaGenerationDbPersistenceDeps)
}

export const mediaGenerationDbPersistenceDeps: MediaGenerationPersistenceDeps = {
  persistImageGenerationPatch: updateImageGenerationPatch,
  persistVideoGenerationPatch: updateVideoGenerationPatch,
  publishStoryboardPatch: updateStoryboardPatch,
  publishCharacterPatch: updateCharacterPatch,
  publishScenePatch: updateScenePatch,
}

async function updateImageGenerationPatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.imageGenerations)
    .set(patch as ImageGenerationDbPatch)
    .where(eq(schema.imageGenerations.id, id))
    .run()
}

async function updateVideoGenerationPatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.videoGenerations)
    .set(patch as VideoGenerationDbPatch)
    .where(eq(schema.videoGenerations.id, id))
    .run()
}

async function updateStoryboardPatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.storyboards)
    .set(patch as StoryboardDbPatch)
    .where(eq(schema.storyboards.id, id))
    .run()
}

async function updateCharacterPatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.characters)
    .set(patch as CharacterDbPatch)
    .where(eq(schema.characters.id, id))
    .run()
}

async function updateScenePatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.scenes)
    .set(patch as SceneDbPatch)
    .where(eq(schema.scenes.id, id))
    .run()
}
