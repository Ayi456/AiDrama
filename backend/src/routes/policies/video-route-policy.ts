import type { VideoGenerationEnqueueParams } from '../../services/media/generation/media-generation-enqueue.js'

type RouteBody = Record<string, unknown>

export type VideoGenerateBody = RouteBody & {
  storyboard_id?: number
  drama_id?: number
  prompt?: string
  model?: string
  reference_mode?: string
  image_url?: string
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[] | string
  reference_video_urls?: string[] | string
  reference_audio_urls?: string[] | string
  duration?: number
  aspect_ratio?: string
  config_id?: number
}

export function validateVideoGenerateBody(body: VideoGenerateBody) {
  return body.prompt ? null : 'prompt is required'
}

export function buildVideoGenerationInput(
  body: VideoGenerateBody,
  configId: number | undefined,
): VideoGenerationEnqueueParams {
  return {
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    prompt: body.prompt || '',
    model: body.model,
    referenceMode: body.reference_mode,
    imageUrl: body.image_url,
    firstFrameUrl: body.first_frame_url,
    lastFrameUrl: body.last_frame_url,
    referenceImageUrls: body.reference_image_urls,
    referenceVideoUrls: body.reference_video_urls,
    referenceAudioUrls: body.reference_audio_urls,
    duration: body.duration,
    aspectRatio: body.aspect_ratio,
    configId,
  }
}

export function buildVideoRouteLogContext(body: VideoGenerateBody) {
  return {
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    referenceMode: body.reference_mode,
    duration: body.duration,
  }
}

export function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message || 'Unknown video generation error'
  if (typeof error === 'string') return error || 'Unknown video generation error'
  return 'Unknown video generation error'
}
