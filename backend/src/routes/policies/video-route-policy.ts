import type { VideoGenerationEnqueueParams } from '../../services/media/generation/media-generation-enqueue.js'
import { presentVideoGenerationAsset } from '../../utils/public-asset.js'

type RouteBody = Record<string, unknown>
type AssetRecord = Record<string, unknown>

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

export type VideoListQuery = {
  storyboard_id?: string | null
  drama_id?: string | null
  limit?: string | null
}

export const DEFAULT_VIDEO_LIST_LIMIT = 24
export const MAX_VIDEO_LIST_LIMIT = 100

export function validateVideoGenerateBody(body: VideoGenerateBody) {
  return body.prompt ? null : 'prompt is required'
}

export function readVideoListNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

export function readVideoListLimit(value: unknown) {
  const parsed = readVideoListNumber(value)
  if (!parsed) return DEFAULT_VIDEO_LIST_LIMIT
  return Math.min(parsed, MAX_VIDEO_LIST_LIMIT)
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

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringValue(value: unknown) {
  return String(value || '').trim()
}

function readFirst(row: AssetRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim()) return value
  }
  return undefined
}

function setAliases(row: AssetRecord, keys: string[], value: unknown) {
  for (const key of keys) row[key] = value
}

function copyEffectiveField(result: AssetRecord, effective: AssetRecord, keys: string[], clearMissing = false) {
  const value = readFirst(effective, keys)
  if (value !== undefined) setAliases(result, keys, value)
  else if (clearMissing) setAliases(result, keys, '')
}

export function presentEffectiveVideoGenerationAsset<T extends AssetRecord>(
  row: T,
  effectiveRow?: AssetRecord | null,
): T & AssetRecord {
  const result: AssetRecord = presentVideoGenerationAsset(row)
  const effective: AssetRecord = effectiveRow ? presentVideoGenerationAsset(effectiveRow) : result

  const rootId = numberValue(result['id'])
  const effectiveId = numberValue(effective['id']) ?? rootId
  const originalStatus = stringValue(result['status'])
  const effectiveStatus = stringValue(effective['status'])
  const hasRegeneration = Boolean(effectiveRow && effectiveId !== rootId)

  if (originalStatus) setAliases(result, ['originalStatus', 'original_status'], originalStatus)
  if (effectiveId != null) {
    setAliases(result, ['effectiveGenerationId', 'effective_generation_id'], effectiveId)
    if (hasRegeneration) setAliases(result, ['regenerationId', 'regeneration_id'], effectiveId)
  }
  if (effectiveStatus) {
    setAliases(result, ['effectiveStatus', 'effective_status'], effectiveStatus)
    if (hasRegeneration) result['status'] = effectiveStatus
  }

  copyEffectiveField(result, effective, ['errorMsg', 'error_msg'], hasRegeneration)
  copyEffectiveField(result, effective, ['videoUrl', 'video_url'], hasRegeneration)
  copyEffectiveField(result, effective, ['minioUrl', 'minio_url'], hasRegeneration)
  copyEffectiveField(result, effective, ['publicUrl', 'public_url'], hasRegeneration)
  copyEffectiveField(result, effective, ['localPath', 'local_path'], hasRegeneration)
  copyEffectiveField(result, effective, ['providerVideoUrl', 'provider_video_url'], hasRegeneration)
  copyEffectiveField(result, effective, ['taskId', 'task_id'], hasRegeneration)
  copyEffectiveField(result, effective, ['completedAt', 'completed_at'], hasRegeneration)
  copyEffectiveField(result, effective, ['updatedAt', 'updated_at'], hasRegeneration)

  const effectiveVideoUrl = readFirst(result, ['videoUrl', 'video_url', 'minioUrl', 'minio_url', 'publicUrl', 'public_url'])
  if (effectiveVideoUrl !== undefined) {
    setAliases(result, ['effectiveVideoUrl', 'effective_video_url'], effectiveVideoUrl)
  }
  const effectiveError = readFirst(result, ['errorMsg', 'error_msg'])
  if (effectiveError !== undefined) {
    setAliases(result, ['effectiveErrorMsg', 'effective_error_msg'], effectiveError)
  }

  return result as T & AssetRecord
}
