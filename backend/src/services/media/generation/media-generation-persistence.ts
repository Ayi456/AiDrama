import { eq } from 'drizzle-orm'
import type * as dbSchema from '../../../db/schema.js'
import { createMediaJobSnapshotPersistor } from '../job/media-job-state.js'

export type MediaGenerationPatch = Record<string, unknown>

type ImageGenerationDbPatch = Partial<typeof dbSchema.imageGenerations.$inferInsert>
type VideoGenerationDbPatch = Partial<typeof dbSchema.videoGenerations.$inferInsert>
type StoryboardDbPatch = Partial<typeof dbSchema.storyboards.$inferInsert>
type CharacterDbPatch = Partial<typeof dbSchema.characters.$inferInsert>
type CharacterAssetDbPatch = Partial<typeof dbSchema.characterAssets.$inferInsert>
type SceneDbPatch = Partial<typeof dbSchema.scenes.$inferInsert>

export type MediaGenerationPersistenceDeps = {
  persistImageGenerationPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  persistVideoGenerationPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishStoryboardPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishCharacterPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishCharacterAssetPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
  publishScenePatch: (id: number, patch: MediaGenerationPatch) => Promise<void>
}

export function createImageGenerationPersistence(id: number, deps: MediaGenerationPersistenceDeps) {
  const persistImageGenerationPatch = bindPatchId(deps.persistImageGenerationPatch, id)

  return {
    persistSnapshot: createMediaJobSnapshotPersistor({
      persistPatch: persistImageGenerationPatch,
    }),
    persistProcessing: persistImageGenerationPatch,
    persistFailure: persistImageGenerationPatch,
    persistImageCompletion: persistImageGenerationPatch,
    publishStoryboardImage: guardPatchPersistor(deps.publishStoryboardPatch),
    publishCharacterImage: guardPatchPersistor(deps.publishCharacterPatch),
    publishCharacterAssetImage: guardPatchPersistor(deps.publishCharacterAssetPatch),
    publishSceneImage: guardPatchPersistor(deps.publishScenePatch),
  }
}

export function createVideoGenerationPersistence(id: number, deps: MediaGenerationPersistenceDeps) {
  const persistVideoGenerationPatch = bindPatchId(deps.persistVideoGenerationPatch, id)

  return {
    persistSnapshot: createMediaJobSnapshotPersistor({
      persistPatch: persistVideoGenerationPatch,
    }),
    persistProcessing: persistVideoGenerationPatch,
    persistFailure: persistVideoGenerationPatch,
    persistVideoCompletion: persistVideoGenerationPatch,
    publishStoryboardVideo: guardPatchPersistor(deps.publishStoryboardPatch),
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
  publishCharacterAssetPatch: updateCharacterAssetPatch,
  publishScenePatch: updateScenePatch,
}

function hasWritablePatchValue(patch: MediaGenerationPatch) {
  return Object.values(patch).some(value => value !== undefined)
}

function bindPatchId(
  persistPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>,
  id: number,
) {
  return (patch: MediaGenerationPatch) => persistPatchIfPresent(persistPatch, id, patch)
}

function guardPatchPersistor(persistPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>) {
  return (id: number, patch: MediaGenerationPatch) => persistPatchIfPresent(persistPatch, id, patch)
}

async function persistPatchIfPresent(
  persistPatch: (id: number, patch: MediaGenerationPatch) => Promise<void>,
  id: number,
  patch: MediaGenerationPatch,
) {
  if (!hasWritablePatchValue(patch)) return
  await persistPatch(id, patch)
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

async function updateCharacterAssetPatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.characterAssets)
    .set(patch as CharacterAssetDbPatch)
    .where(eq(schema.characterAssets.id, id))
    .run()
}

async function updateScenePatch(id: number, patch: MediaGenerationPatch) {
  const { db, schema } = await import('../../../db/index.js')
  await db.update(schema.scenes)
    .set(patch as SceneDbPatch)
    .where(eq(schema.scenes.id, id))
    .run()
}
