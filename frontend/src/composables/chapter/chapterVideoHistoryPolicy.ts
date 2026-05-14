export type VideoHistoryItem = {
  id?: unknown
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

export function normalizeVideoHistory<T extends VideoHistoryItem>(
  rows: T[] | null | undefined,
  limit = 24,
) {
  return [...(rows || [])]
    .filter(row => !!getVideoHistoryUrl(row))
    .sort((a, b) => {
      const aTime = videoHistoryCreatedTime(a)
      const bTime = videoHistoryCreatedTime(b)
      if (aTime !== bTime) return bTime - aTime
      return videoHistoryId(b) - videoHistoryId(a)
    })
    .slice(0, limit)
}
