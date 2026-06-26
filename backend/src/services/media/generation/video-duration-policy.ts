export const DEFAULT_VIDEO_GENERATION_DURATION_SECONDS = 5
export const DEFAULT_STORYBOARD_DURATION_SECONDS = 10
export const MIN_VIDEO_GENERATION_DURATION_SECONDS = 4
export const MAX_VIDEO_GENERATION_DURATION_SECONDS = 15

export function normalizeVideoGenerationDuration(
  value: unknown,
  fallback = DEFAULT_VIDEO_GENERATION_DURATION_SECONDS,
) {
  const parsed = Number(value)
  const fallbackDuration = Math.round(Number(fallback) || DEFAULT_VIDEO_GENERATION_DURATION_SECONDS)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackDuration

  const rounded = Math.round(parsed)
  return Math.min(
    MAX_VIDEO_GENERATION_DURATION_SECONDS,
    Math.max(MIN_VIDEO_GENERATION_DURATION_SECONDS, rounded),
  )
}
