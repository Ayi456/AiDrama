const DEFAULT_STALE_MERGE_BASE_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_STALE_MERGE_PER_CLIP_MS = 5 * 60 * 1000
const DEFAULT_STALE_MERGE_MAX_TIMEOUT_MS = 4 * 60 * 60 * 1000

type MergeRecordLike = {
  status?: string | null
  createdAt?: string | null
  scenes?: string | null
}

export function resolveMergeClipCount(scenes?: string | null) {
  if (!scenes) return 0
  try {
    const parsed = JSON.parse(scenes)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

export function resolveStaleMergeTimeoutMs(
  rawValue = process.env.STALE_MERGE_TIMEOUT_MS,
  merge?: MergeRecordLike,
) {
  const parsed = Number(rawValue)
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)

  const clipCount = resolveMergeClipCount(merge?.scenes)
  const dynamicTimeout = DEFAULT_STALE_MERGE_BASE_TIMEOUT_MS
    + Math.max(0, clipCount - 1) * DEFAULT_STALE_MERGE_PER_CLIP_MS
  return Math.min(dynamicTimeout, DEFAULT_STALE_MERGE_MAX_TIMEOUT_MS)
}

export function isStaleProcessingMerge(
  merge: MergeRecordLike,
  nowMs = Date.now(),
  staleMs = resolveStaleMergeTimeoutMs(undefined, merge),
) {
  if (merge.status !== 'processing') return false

  const createdAtMs = Date.parse(String(merge.createdAt || ''))
  if (!Number.isFinite(createdAtMs)) return false

  return nowMs - createdAtMs > staleMs
}
