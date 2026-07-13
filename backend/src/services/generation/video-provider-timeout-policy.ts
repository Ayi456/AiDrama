export const DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS = 60_000
export const DEFAULT_VIDEO_POLL_TIMEOUT_MS = 30_000

function positiveTimeout(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

export function resolveVideoSubmitTimeoutMs(
  value: unknown = process.env.VIDEO_SUBMIT_TIMEOUT_MS,
) {
  return positiveTimeout(value, DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS)
}

export function resolveVideoPollTimeoutMs(
  value: unknown = process.env.VIDEO_POLL_TIMEOUT_MS,
) {
  return positiveTimeout(value, DEFAULT_VIDEO_POLL_TIMEOUT_MS)
}
