import { and, eq, isNull } from 'drizzle-orm'

import { db, schema } from '../../db/index.js'
import { isOwnedByUser } from '../policies/ownership-policy.js'

export async function findOwnedDrama(userId: number, dramaId: number) {
  if (!Number.isFinite(dramaId) || dramaId <= 0) return null
  const [drama] = await db.select().from(schema.dramas)
    .where(and(eq(schema.dramas.id, dramaId), eq(schema.dramas.userId, userId), isNull(schema.dramas.deletedAt)))
    .all()
  return drama || null
}

export async function findOwnedEpisode(userId: number, episodeId: number) {
  if (!Number.isFinite(episodeId) || episodeId <= 0) return null
  const [episode] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!episode) return null
  const drama = await findOwnedDrama(userId, episode.dramaId)
  return drama ? episode : null
}

export async function findOwnedCharacterAsset(userId: number, assetId: number) {
  if (!Number.isFinite(assetId) || assetId <= 0) return null
  const [asset] = await db.select().from(schema.characterAssets)
    .where(and(eq(schema.characterAssets.id, assetId), eq(schema.characterAssets.userId, userId), isNull(schema.characterAssets.deletedAt)))
    .all()
  return asset || null
}

export async function findOwnedCharacter(userId: number, characterId: number) {
  if (!Number.isFinite(characterId) || characterId <= 0) return null
  const [character] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  if (!character || character.deletedAt) return null
  const drama = await findOwnedDrama(userId, character.dramaId)
  return drama ? character : null
}

export async function findOwnedScene(userId: number, sceneId: number) {
  if (!Number.isFinite(sceneId) || sceneId <= 0) return null
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).all()
  if (!scene || scene.deletedAt) return null
  const drama = await findOwnedDrama(userId, scene.dramaId)
  return drama ? scene : null
}

export async function findOwnedStoryboard(userId: number, storyboardId: number) {
  if (!Number.isFinite(storyboardId) || storyboardId <= 0) return null
  const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!storyboard || storyboard.deletedAt) return null
  const episode = await findOwnedEpisode(userId, storyboard.episodeId)
  return episode ? storyboard : null
}

export async function findOwnedImageGeneration(userId: number, imageGenerationId: number) {
  if (!Number.isFinite(imageGenerationId) || imageGenerationId <= 0) return null
  const [row] = await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, imageGenerationId)).all()
  if (!row) return null
  if (row.dramaId && await findOwnedDrama(userId, row.dramaId)) return row
  if (row.storyboardId && await findOwnedStoryboard(userId, row.storyboardId)) return row
  if (row.sceneId && await findOwnedScene(userId, row.sceneId)) return row
  if (row.characterId && await findOwnedCharacter(userId, row.characterId)) return row
  if (row.characterAssetId && await findOwnedCharacterAsset(userId, row.characterAssetId)) return row
  return null
}

export async function findOwnedVideoGeneration(userId: number, videoGenerationId: number) {
  if (!Number.isFinite(videoGenerationId) || videoGenerationId <= 0) return null
  const [row] = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, videoGenerationId)).all()
  if (!row || row.deletedAt) return null
  if (row.userId === userId) return row
  if (row.dramaId && await findOwnedDrama(userId, row.dramaId)) return row
  if (row.storyboardId && await findOwnedStoryboard(userId, row.storyboardId)) return row
  return null
}

export async function filterOwnedImageGenerations<T extends typeof schema.imageGenerations.$inferSelect>(userId: number, rows: T[]) {
  const owned: T[] = []
  for (const row of rows) {
    if (row.dramaId && await findOwnedDrama(userId, row.dramaId)) owned.push(row)
    else if (row.storyboardId && await findOwnedStoryboard(userId, row.storyboardId)) owned.push(row)
    else if (row.sceneId && await findOwnedScene(userId, row.sceneId)) owned.push(row)
    else if (row.characterId && await findOwnedCharacter(userId, row.characterId)) owned.push(row)
    else if (row.characterAssetId && await findOwnedCharacterAsset(userId, row.characterAssetId)) owned.push(row)
  }
  return owned
}

export async function filterOwnedVideoGenerations<T extends typeof schema.videoGenerations.$inferSelect>(userId: number, rows: T[]) {
  const owned: T[] = []
  for (const row of rows) {
    if (row.userId === userId) owned.push(row)
    else if (row.dramaId && await findOwnedDrama(userId, row.dramaId)) owned.push(row)
    else if (row.storyboardId && await findOwnedStoryboard(userId, row.storyboardId)) owned.push(row)
  }
  return owned
}

export function rowOwnedByCurrentUser<T extends { userId?: number | null }>(row: T | null | undefined, userId: number) {
  return isOwnedByUser(row, userId)
}
