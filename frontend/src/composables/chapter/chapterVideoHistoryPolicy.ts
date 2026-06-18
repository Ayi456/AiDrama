export type VideoHistoryItem = {
  id?: unknown
  status?: unknown
  effective_status?: unknown
  effectiveStatus?: unknown
  billing_status?: unknown
  billingStatus?: unknown
  effective_generation_id?: unknown
  effectiveGenerationId?: unknown
  regeneration_id?: unknown
  regenerationId?: unknown
  video_url?: unknown
  videoUrl?: unknown
  minio_url?: unknown
  minioUrl?: unknown
  created_at?: unknown
  createdAt?: unknown
}

function stringValue(value: unknown) {
  return String(value || '').trim()
}

export function getVideoHistoryUrl(item: VideoHistoryItem | null | undefined) {
  return stringValue(item?.video_url || item?.videoUrl || item?.minio_url || item?.minioUrl)
}

function videoHistoryCreatedTime(item: VideoHistoryItem) {
  return Date.parse(stringValue(item.created_at || item.createdAt)) || 0
}

function videoHistoryId(item: VideoHistoryItem) {
  return Number(item.id || 0)
}

function videoHistoryStatus(item: VideoHistoryItem) {
  return stringValue(item.effective_status || item.effectiveStatus || item.status).toLowerCase()
}

function videoHistoryBillingStatus(item: VideoHistoryItem) {
  return stringValue(item.billing_status || item.billingStatus || 'unbilled').toLowerCase() || 'unbilled'
}

function videoHistoryEffectiveId(item: VideoHistoryItem) {
  return Number(
    item.effective_generation_id ||
    item.effectiveGenerationId ||
    item.regeneration_id ||
    item.regenerationId ||
    item.id ||
    0,
  )
}

function newestVideoHistoryRows<T extends VideoHistoryItem>(rows: T[] | null | undefined) {
  return [...(rows || [])].sort((a, b) => {
    const aTime = videoHistoryCreatedTime(a)
    const bTime = videoHistoryCreatedTime(b)
    if (aTime !== bTime) return bTime - aTime
    return videoHistoryId(b) - videoHistoryId(a)
  })
}

const IN_FLIGHT_VIDEO_HISTORY_STATUSES = new Set(['pending', 'processing', 'checking_defect', 'failed_defect'])

export function getPendingVideoHistoryGeneration(rows: VideoHistoryItem[] | null | undefined) {
  const row = newestVideoHistoryRows(rows)[0]
  if (!row) return null
  const billingStatus = videoHistoryBillingStatus(row)
  if (billingStatus && billingStatus !== 'unbilled') return null
  if (!IN_FLIGHT_VIDEO_HISTORY_STATUSES.has(videoHistoryStatus(row))) return null

  const generationId = videoHistoryEffectiveId(row)
  return {
    generationId: Number.isFinite(generationId) ? generationId : 0,
    status: videoHistoryStatus(row),
    billingStatus: videoHistoryBillingStatus(row),
  }
}

export function normalizeVideoHistory<T extends VideoHistoryItem>(
  rows: T[] | null | undefined,
  limit = 24,
) {
  return newestVideoHistoryRows(rows)
    .filter(row => !!getVideoHistoryUrl(row))
    .slice(0, limit)
}

export function shouldApplyVideoHistoryLoadResult(
  latestTokens: Record<number, number>,
  storyboardId: number,
  token: number,
) {
  return Number(latestTokens[Number(storyboardId)] || 0) === Number(token)
}
