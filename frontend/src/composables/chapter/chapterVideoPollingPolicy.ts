import { normalizeApiErrorMessage } from '../useApi.ts'

export const VIDEO_CLIENT_POLL_ATTEMPTS = 360
export const VIDEO_CLIENT_POLL_DELAY_MS = 10000
export const VIDEO_CLIENT_POLL_TOTAL_MS = VIDEO_CLIENT_POLL_ATTEMPTS * VIDEO_CLIENT_POLL_DELAY_MS
export const VIDEO_POLL_EXHAUSTED_MESSAGE = '视频仍在生成中，后台会继续处理，稍后刷新即可查看结果'

type VideoPollGeneration = {
  status?: unknown
  effective_status?: unknown
  effectiveStatus?: unknown
  regeneration_id?: unknown
  regenerationId?: unknown
  error_msg?: unknown
  errorMsg?: unknown
  effective_error_msg?: unknown
  effectiveErrorMsg?: unknown
  video_url?: unknown
  videoUrl?: unknown
  effective_video_url?: unknown
  effectiveVideoUrl?: unknown
  minio_url?: unknown
  minioUrl?: unknown
  public_url?: unknown
  publicUrl?: unknown
}

type VideoPollOptions = {
  storyboardHasVideo?: boolean
}

export type VideoPollOutcome =
  | { type: 'completed' }
  | { type: 'failed'; message: string }
  | { type: 'pending' }

function stringValue(value: unknown) {
  return String(value || '').trim()
}

export function getVideoPollGenerationUrl(generation: VideoPollGeneration | null | undefined) {
  return stringValue(
    generation?.effective_video_url ||
    generation?.effectiveVideoUrl ||
    generation?.video_url ||
    generation?.videoUrl ||
    generation?.minio_url ||
    generation?.minioUrl ||
    generation?.public_url ||
    generation?.publicUrl,
  )
}

export function hasNewStoryboardVideo(currentUrl: unknown, previousUrl: unknown) {
  const current = stringValue(currentUrl)
  if (!current) return false
  const previous = stringValue(previousUrl)
  return !previous || current !== previous
}

export function resolveVideoPollOutcome(
  generation: VideoPollGeneration | null | undefined,
  options: VideoPollOptions = {},
): VideoPollOutcome {
  if (options.storyboardHasVideo) return { type: 'completed' }

  const status = stringValue(generation?.effective_status || generation?.effectiveStatus || generation?.status).toLowerCase()
  if (status === 'completed') {
    return getVideoPollGenerationUrl(generation) ? { type: 'completed' } : { type: 'pending' }
  }
  if (status === 'failed') {
    return {
      type: 'failed',
      message: normalizeApiErrorMessage(
        generation?.effective_error_msg ||
        generation?.effectiveErrorMsg ||
        generation?.error_msg ||
        generation?.errorMsg,
        '视频生成失败',
      ),
    }
  }
  return { type: 'pending' }
}

export function resolveVideoPollExhaustedOutcome(): Extract<VideoPollOutcome, { type: 'pending' }> & { message: string } {
  return {
    type: 'pending',
    message: VIDEO_POLL_EXHAUSTED_MESSAGE,
  }
}
