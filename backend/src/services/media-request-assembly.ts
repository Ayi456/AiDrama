import type {
  AIConfig,
  ImageGenerationRecord,
  ImageProviderAdapter,
  ProviderRequest,
  VideoGenerationRecord,
  VideoProviderAdapter,
} from './adapters/types.js'
import {
  buildImageJobSpecFromLegacyRequest,
  buildVideoJobSpecFromLegacyRequest,
  type ImageJobSpec,
  type ProviderDefaults,
  type VideoJobSpec,
} from './provider-spec.js'

export type ImageRequestRecord = Pick<
  ImageGenerationRecord,
  'id' | 'model' | 'prompt' | 'size' | 'frameType'
>

export type VideoRequestRecord = Pick<
  VideoGenerationRecord,
  | 'id'
  | 'model'
  | 'prompt'
  | 'referenceMode'
  | 'duration'
  | 'aspectRatio'
>

export type ResolvedVideoReferences = {
  imageUrl: string | null
  firstFrameUrl: string | null
  lastFrameUrl: string | null
  referenceImageUrls: string[]
  referenceVideoUrls: string[]
  referenceAudioUrls: string[]
}

export type ImageGenerateRequestAssembly = {
  normalizedSpec: ImageJobSpec
  providerRequest: ProviderRequest
}

export type VideoGenerateRequestAssembly = {
  normalizedSpec: VideoJobSpec
  providerRequest: ProviderRequest
}

function providerDefaultsFromConfig(config: AIConfig): ProviderDefaults {
  const settings = config.settings as Partial<ProviderDefaults> | undefined
  return {
    control: settings?.control,
    providerOptions: settings?.providerOptions,
  }
}

function jsonStringList(values: string[] | null | undefined) {
  return values ? JSON.stringify(values) : null
}

export function assembleImageGenerateRequest(params: {
  adapter: ImageProviderAdapter
  config: AIConfig
  record: ImageRequestRecord
  resolvedReferenceImages: string[]
}): ImageGenerateRequestAssembly {
  const normalizedSpec = buildImageJobSpecFromLegacyRequest({
    prompt: params.record.prompt,
    size: params.record.size,
    frameType: params.record.frameType,
    referenceImages: params.resolvedReferenceImages,
  }, providerDefaultsFromConfig(params.config))

  const providerRequest = params.adapter.buildGenerateRequest(params.config, {
    id: params.record.id,
    model: params.record.model,
    prompt: params.record.prompt,
    size: params.record.size,
    frameType: params.record.frameType,
    referenceImages: jsonStringList(params.resolvedReferenceImages),
    normalizedSpec,
  })

  return { normalizedSpec, providerRequest }
}

export function assembleVideoGenerateRequest(params: {
  adapter: VideoProviderAdapter
  config: AIConfig
  record: VideoRequestRecord
  resolvedReferences: ResolvedVideoReferences
}): VideoGenerateRequestAssembly {
  const normalizedSpec = buildVideoJobSpecFromLegacyRequest({
    prompt: params.record.prompt,
    referenceMode: params.record.referenceMode,
    imageUrl: params.resolvedReferences.imageUrl,
    firstFrameUrl: params.resolvedReferences.firstFrameUrl,
    lastFrameUrl: params.resolvedReferences.lastFrameUrl,
    referenceImageUrls: params.resolvedReferences.referenceImageUrls,
    referenceVideoUrls: params.resolvedReferences.referenceVideoUrls,
    referenceAudioUrls: params.resolvedReferences.referenceAudioUrls,
    duration: params.record.duration,
    aspectRatio: params.record.aspectRatio,
  }, providerDefaultsFromConfig(params.config))

  const providerRequest = params.adapter.buildGenerateRequest(params.config, {
    id: params.record.id,
    model: params.record.model,
    prompt: params.record.prompt,
    referenceMode: params.record.referenceMode,
    imageUrl: params.resolvedReferences.imageUrl,
    firstFrameUrl: params.resolvedReferences.firstFrameUrl,
    lastFrameUrl: params.resolvedReferences.lastFrameUrl,
    referenceImageUrls: jsonStringList(params.resolvedReferences.referenceImageUrls),
    referenceVideoUrls: jsonStringList(params.resolvedReferences.referenceVideoUrls),
    referenceAudioUrls: jsonStringList(params.resolvedReferences.referenceAudioUrls),
    duration: params.record.duration,
    aspectRatio: params.record.aspectRatio,
    normalizedSpec,
  })

  return { normalizedSpec, providerRequest }
}
