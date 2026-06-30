const DEFAULT_STALE_MERGE_BASE_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_STALE_MERGE_PER_CLIP_MS = 5 * 60 * 1000
const DEFAULT_STALE_MERGE_MAX_TIMEOUT_MS = 4 * 60 * 60 * 1000

type MergeRecordLike = {
  status?: string | null
  createdAt?: string | null
  scenes?: string | null
}

type ParsedMergeScene = {
  storyboardId?: unknown
  videoUrl?: unknown
} | null

export function resolveMergeClipCount(scenes?: string | null) {
  return parseMergeScenes(scenes).length
}

export function resolveMergeStoryboardIds(scenes?: string | null) {
  return parseMergeScenes(scenes)
    .map(item => Number(item?.storyboardId))
    .filter(Number.isFinite)
}

export function resolveMergeStoryboardClipOverrides(scenes?: string | null) {
  return parseMergeScenes(scenes)
    .map(item => ({
      storyboardId: Number(item?.storyboardId),
      videoUrl: String(item?.videoUrl || '').trim(),
    }))
    .filter(item => Number.isInteger(item.storyboardId) && item.storyboardId > 0 && item.videoUrl)
}

function parseMergeScenes(scenes?: string | null): ParsedMergeScene[] {
  if (!scenes) return []
  try {
    const parsed = JSON.parse(scenes)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
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
