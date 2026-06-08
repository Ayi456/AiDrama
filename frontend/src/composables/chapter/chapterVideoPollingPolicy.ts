import { normalizeApiErrorMessage } from '../useApi.ts'

export const VIDEO_CLIENT_POLL_ATTEMPTS = 360
export const VIDEO_CLIENT_POLL_DELAY_MS = 10000
export const VIDEO_CLIENT_POLL_TOTAL_MS = VIDEO_CLIENT_POLL_ATTEMPTS * VIDEO_CLIENT_POLL_DELAY_MS
export const VIDEO_POLL_EXHAUSTED_MESSAGE = '视频仍在生成中，后台会继续处理，稍后刷新即可查看结果'

type VideoPollGeneration = {
  status?: unknown
  error_msg?: unknown
  errorMsg?: unknown
}

type VideoPollOptions = {
  storyboardHasVideo?: boolean
}

export type VideoPollOutcome =
  | { type: 'completed' }
  | { type: 'failed'; message: string }
  | { type: 'pending' }

export function resolveVideoPollOutcome(
  generation: VideoPollGeneration | null | undefined,
  options: VideoPollOptions = {},
): VideoPollOutcome {
  if (options.storyboardHasVideo) return { type: 'completed' }

  const status = String(generation?.status || '').trim().toLowerCase()
  if (status === 'completed') return { type: 'completed' }
  if (status === 'failed') {
    return {
      type: 'failed',
      message: normalizeApiErrorMessage(generation?.error_msg || generation?.errorMsg, '视频生成失败'),
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
