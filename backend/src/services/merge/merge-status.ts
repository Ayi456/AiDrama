const DEFAULT_STALE_MERGE_TIMEOUT_MS = 30 * 60 * 1000

type MergeRecordLike = {
  status?: string | null
  createdAt?: string | null
}

export function resolveStaleMergeTimeoutMs(rawValue = process.env.STALE_MERGE_TIMEOUT_MS) {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_STALE_MERGE_TIMEOUT_MS
}

export function isStaleProcessingMerge(
  merge: MergeRecordLike,
  nowMs = Date.now(),
  staleMs = resolveStaleMergeTimeoutMs(),
) {
  if (merge.status !== 'processing') return false

  const createdAtMs = Date.parse(String(merge.createdAt || ''))
  if (!Number.isFinite(createdAtMs)) return false

  return nowMs - createdAtMs > staleMs
}
