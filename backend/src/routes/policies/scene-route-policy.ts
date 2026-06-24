import { resolveSceneEnvironmentPrompt } from '../../agents/visual-prompt-policy.js'
import type { RouteBody } from '../shared/route-body.js'
import { hasOwn, readBodyId, readBodyText } from '../shared/route-body.js'

export type SceneCreateInput = {
  dramaId: number
  episodeId: number
  location: string
  imageUrl: string
}

export type SceneCreateValues = {
  dramaId: number
  episodeId: number | null
  location: string
  time: string
  prompt: string
  imageUrl: string | null
  localPath: string | null
  referenceImage: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export type SceneUpdatePatch = {
  updatedAt: string
  location?: string
  time?: string
  prompt?: string
  imageUrl?: string | null
  localPath?: string | null
  status?: string | null
  referenceImage?: string | null
}

export function readSceneCreateInput(body: RouteBody): SceneCreateInput {
  return {
    dramaId: readBodyId(body, 'drama_id', 'dramaId'),
    episodeId: readBodyId(body, 'episode_id', 'episodeId'),
    location: readBodyText(body, 'location'),
    imageUrl: readBodyText(body, 'image_url', 'imageUrl'),
  }
}

export function buildSceneCreateValues(
  body: RouteBody,
  input: SceneCreateInput,
  timestamp: string,
): SceneCreateValues {
  return {
    dramaId: input.dramaId,
    episodeId: input.episodeId || null,
    location: input.location,
    time: readBodyText(body, 'time'),
    prompt: resolveSceneEnvironmentPrompt(readBodyText(body, 'prompt') || null, input.location),
    imageUrl: input.imageUrl || null,
    localPath: readBodyText(body, 'local_path', 'localPath') || null,
    referenceImage: readBodyText(body, 'reference_image', 'referenceImage') || null,
    status: readBodyText(body, 'status') || (input.imageUrl ? 'completed' : 'pending'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function needsSceneUpdateLocationFallback(body: RouteBody) {
  return hasOwn(body, 'prompt') && typeof body.location !== 'string'
}

export function buildSceneUpdatePatch(
  body: RouteBody,
  updatedAt: string,
  existingLocation = '',
): SceneUpdatePatch {
  const updates: SceneUpdatePatch = { updatedAt }
  if (hasOwn(body, 'location')) updates.location = body.location as string
  if (hasOwn(body, 'time')) updates.time = body.time as string
  if (hasOwn(body, 'prompt')) {
    const fallbackLocation = typeof updates.location === 'string' ? updates.location : existingLocation
    updates.prompt = resolveSceneEnvironmentPrompt(body.prompt as string, fallbackLocation)
  }
  if (hasOwn(body, 'image_url')) updates.imageUrl = body.image_url as string | null
  if (hasOwn(body, 'imageUrl')) updates.imageUrl = body.imageUrl as string | null
  if (hasOwn(body, 'local_path')) updates.localPath = body.local_path as string | null
  if (hasOwn(body, 'localPath')) updates.localPath = body.localPath as string | null
  if (hasOwn(body, 'status')) updates.status = body.status as string | null
  if (hasOwn(body, 'reference_image')) updates.referenceImage = body.reference_image as string | null
  if (hasOwn(body, 'referenceImage')) updates.referenceImage = body.referenceImage as string | null
  return updates
}
