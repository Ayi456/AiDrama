import type { ImageGenerationEnqueueParams } from '../../services/media/generation/media-generation-enqueue.js'
import type { RouteBody } from '../shared/route-body.js'

export type ImageGenerateBody = RouteBody & {
  storyboard_id?: number | string
  drama_id?: number | string
  scene_id?: number | string
  character_id?: number | string
  prompt?: string
  model?: string
  size?: string
  reference_images?: string[]
  frame_type?: string
  config_id?: number | string
}

export type ImageOwnershipIds = {
  dramaId?: number
  storyboardId?: number
  sceneId?: number
  characterId?: number
}

function readTruthyNumber(value: unknown) {
  return value ? Number(value) : undefined
}

function readTypedNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function readTypedString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function hasImageOwner(body: ImageGenerateBody) {
  return Boolean(body.drama_id || body.storyboard_id || body.scene_id || body.character_id)
}

export function validateImageGenerateBody(body: ImageGenerateBody) {
  const prompt = readTypedString(body.prompt) || ''
  if (!prompt) return 'prompt is required'
  if (!hasImageOwner(body)) return 'drama_id, storyboard_id, scene_id, or character_id is required'
  return null
}

export function readImageOwnershipIds(body: ImageGenerateBody): ImageOwnershipIds {
  return {
    dramaId: readTruthyNumber(body.drama_id),
    storyboardId: readTruthyNumber(body.storyboard_id),
    sceneId: readTruthyNumber(body.scene_id),
    characterId: readTruthyNumber(body.character_id),
  }
}

export function readImageRequestedConfigId(body: ImageGenerateBody) {
  return readTypedNumber(body.config_id)
}

export function buildImageGenerationInput(
  body: ImageGenerateBody,
  configId: number | undefined,
): ImageGenerationEnqueueParams {
  return {
    storyboardId: readTypedNumber(body.storyboard_id),
    dramaId: readTypedNumber(body.drama_id),
    sceneId: readTypedNumber(body.scene_id),
    characterId: readTypedNumber(body.character_id),
    prompt: readTypedString(body.prompt) || '',
    model: readTypedString(body.model),
    size: readTypedString(body.size),
    referenceImages: Array.isArray(body.reference_images) ? body.reference_images : undefined,
    frameType: readTypedString(body.frame_type),
    configId,
  }
}

export function buildImageRouteLogContext(body: ImageGenerateBody) {
  return {
    storyboardId: body.storyboard_id,
    sceneId: body.scene_id,
    characterId: body.character_id,
    dramaId: body.drama_id,
    frameType: body.frame_type,
  }
}
