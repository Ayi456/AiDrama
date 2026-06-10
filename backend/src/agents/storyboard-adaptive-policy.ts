export type StoryboardAdaptivePolicy = {
  chunkChars: number
  minChunkChars: number
  retryShrinkRatio: number
  maxAttempts: number
  chunkTimeoutMs: number
}

export type StoryboardAdaptivePolicyOverrides = {
  chunkChars?: number
}

export const DEFAULT_STORYBOARD_CHUNK_CHARS = 12000
export const DEFAULT_STORYBOARD_MIN_CHUNK_CHARS = 350
export const DEFAULT_STORYBOARD_RETRY_SHRINK_RATIO = 0.5
export const DEFAULT_STORYBOARD_MAX_ATTEMPTS = 3
export const DEFAULT_STORYBOARD_CHUNK_TIMEOUT_MS = 600_000

function numberSetting(settings: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(settings[key])
    if (Number.isFinite(value) && value > 0) return value
  }
  return fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function resolveStoryboardAdaptivePolicy(
  settings: Record<string, unknown> = {},
  overrides: StoryboardAdaptivePolicyOverrides = {},
): StoryboardAdaptivePolicy {
  const requestedChunkChars = overrides.chunkChars || numberSetting(
    settings,
    ['storyboardChunkChars', 'storyboard_chunk_chars'],
    DEFAULT_STORYBOARD_CHUNK_CHARS,
  )
  const chunkChars = Math.trunc(clamp(requestedChunkChars, 350, 12000))
  const requestedMinChunkChars = numberSetting(
    settings,
    ['storyboardMinChunkChars', 'storyboard_min_chunk_chars'],
    DEFAULT_STORYBOARD_MIN_CHUNK_CHARS,
  )
  const minChunkChars = Math.trunc(clamp(requestedMinChunkChars, 200, chunkChars))
  const retryShrinkRatio = clamp(
    numberSetting(
      settings,
      ['storyboardRetryShrinkRatio', 'storyboard_retry_shrink_ratio'],
      DEFAULT_STORYBOARD_RETRY_SHRINK_RATIO,
    ),
    0.2,
    0.9,
  )
  const maxAttempts = Math.trunc(clamp(
    numberSetting(
      settings,
      ['storyboardChunkRetries', 'storyboard_chunk_retries', 'storyboardMaxAttempts', 'storyboard_max_attempts'],
      DEFAULT_STORYBOARD_MAX_ATTEMPTS,
    ),
    1,
    5,
  ))
  const chunkTimeoutMs = Math.trunc(clamp(
    numberSetting(
      settings,
      ['storyboardChunkTimeoutMs', 'storyboard_chunk_timeout_ms'],
      DEFAULT_STORYBOARD_CHUNK_TIMEOUT_MS,
    ),
    60_000,
    840_000,
  ))

  return {
    chunkChars,
    minChunkChars,
    retryShrinkRatio,
    maxAttempts,
    chunkTimeoutMs,
  }
}

export function nextStoryboardRetryChunkChars(
  currentLength: number,
  policy: StoryboardAdaptivePolicy,
) {
  const next = Math.floor(currentLength * policy.retryShrinkRatio)
  return Math.max(policy.minChunkChars, Math.min(currentLength - 1, next))
}

export function canSplitStoryboardChunkForRetry(
  currentLength: number,
  attempt: number,
  policy: StoryboardAdaptivePolicy,
) {
  return attempt < policy.maxAttempts && currentLength > policy.minChunkChars
}
