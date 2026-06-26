import type { AIConfig } from '../../adapters/types.js'
import { resolveRequestedImageSize } from '../../provider/image-size.js'
import { stringifyStringList } from '../assets/media-reference-resolver.js'
import {
  DEFAULT_VIDEO_GENERATION_DURATION_SECONDS,
  normalizeVideoGenerationDuration,
} from './video-duration-policy.js'

export type ImageGenerationEnqueueParams = {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  characterAssetId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

export type VideoGenerationEnqueueParams = {
  userId?: number
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[] | string
  referenceVideoUrls?: string[] | string
  referenceAudioUrls?: string[] | string
  duration?: number
  aspectRatio?: string
  configId?: number
  defectCheckAttempt?: number
  defectCheckParentId?: number
}

export function buildImageGenerationEnqueueRecord(input: {
  params: ImageGenerationEnqueueParams
  config: AIConfig
  enqueuedAt: string
}) {
  const model = input.params.model || input.config.model
  return {
    storyboardId: input.params.storyboardId,
    dramaId: input.params.dramaId,
    sceneId: input.params.sceneId,
    characterId: input.params.characterId,
    characterAssetId: input.params.characterAssetId,
    prompt: input.params.prompt,
    model,
    provider: input.config.provider,
    size: resolveRequestedImageSize(input.config.provider, input.params.size, model),
    frameType: input.params.frameType,
    referenceImages: input.params.referenceImages ? JSON.stringify(input.params.referenceImages) : null,
    status: 'processing' as const,
    createdAt: input.enqueuedAt,
    updatedAt: input.enqueuedAt,
  }
}

export function buildVideoGenerationEnqueueRecord(input: {
  params: VideoGenerationEnqueueParams
  config: AIConfig
  enqueuedAt: string
}) {
  const duration = input.config.provider === 'volcengine'
    ? normalizeVideoGenerationDuration(input.params.duration, DEFAULT_VIDEO_GENERATION_DURATION_SECONDS)
    : input.params.duration || DEFAULT_VIDEO_GENERATION_DURATION_SECONDS

  return {
    ...(input.params.userId === undefined ? {} : { userId: input.params.userId }),
    storyboardId: input.params.storyboardId,
    dramaId: input.params.dramaId,
    prompt: input.params.prompt,
    model: input.params.model || input.config.model,
    provider: input.config.provider,
    referenceMode: input.params.referenceMode || 'none',
    imageUrl: input.params.imageUrl,
    firstFrameUrl: input.params.firstFrameUrl,
    lastFrameUrl: input.params.lastFrameUrl,
    referenceImageUrls: stringifyStringList(input.params.referenceImageUrls),
    referenceVideoUrls: stringifyStringList(input.params.referenceVideoUrls),
    referenceAudioUrls: stringifyStringList(input.params.referenceAudioUrls),
    duration,
    aspectRatio: input.params.aspectRatio || '16:9',
    defectCheckAttempt: input.params.defectCheckAttempt,
    defectCheckParentId: input.params.defectCheckParentId,
    status: 'processing' as const,
    createdAt: input.enqueuedAt,
    updatedAt: input.enqueuedAt,
  }
}

export function buildImageGenerationEnqueueStartContext(input: {
  id: number
  params: ImageGenerationEnqueueParams
  config: AIConfig
}) {
  return {
    id: input.id,
    provider: input.config.provider,
    storyboardId: input.params.storyboardId,
    sceneId: input.params.sceneId,
    characterId: input.params.characterId,
    characterAssetId: input.params.characterAssetId,
    frameType: input.params.frameType,
    model: input.params.model || input.config.model,
  }
}

export function buildVideoGenerationEnqueueStartContext(input: {
  id: number
  params: VideoGenerationEnqueueParams
  config: AIConfig
}) {
  const duration = input.config.provider === 'volcengine'
    ? normalizeVideoGenerationDuration(input.params.duration, DEFAULT_VIDEO_GENERATION_DURATION_SECONDS)
    : input.params.duration || DEFAULT_VIDEO_GENERATION_DURATION_SECONDS

  return {
    id: input.id,
    provider: input.config.provider,
    storyboardId: input.params.storyboardId,
    dramaId: input.params.dramaId,
    referenceMode: input.params.referenceMode || 'none',
    duration,
  }
}

export function buildMediaGenerationEnqueuePayload<TParams>(input: {
  id: number
  config: AIConfig
  params: TParams
}) {
  return {
    id: input.id,
    config: {
      provider: input.config.provider,
      model: input.config.model,
      baseUrl: input.config.baseUrl,
    },
    params: input.params,
  }
}
