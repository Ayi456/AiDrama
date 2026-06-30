import type { RouteBody } from '../shared/route-body.js'

export type SelectedMergeClipOverride = {
  storyboardId: number
  videoUrl: string
}

function readMergeClipRows(body: RouteBody) {
  return Array.isArray(body.clips) ? body.clips : []
}

function readMergeClipStoryboardId(value: unknown) {
  if (!value || typeof value !== 'object') return 0
  const row = value as Record<string, unknown>
  return Number(row.storyboard_id ?? row.storyboardId ?? 0)
}

function readMergeClipVideoUrl(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return String(row.video_url ?? row.videoUrl ?? '').trim()
}

export function selectedStoryboardIdsFromBody(body: RouteBody): number[] | undefined {
  const raw = body.storyboard_ids ?? body.storyboardIds
  if (!Array.isArray(raw)) return undefined

  return Array.from(new Set(
    raw
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  ))
}

export function selectedMergeClipOverridesFromBody(body: RouteBody): SelectedMergeClipOverride[] {
  return Array.from(
    new Map(
      readMergeClipRows(body)
        .map((row) => ({
          storyboardId: readMergeClipStoryboardId(row),
          videoUrl: readMergeClipVideoUrl(row),
        }))
        .filter((row) => Number.isInteger(row.storyboardId) && row.storyboardId > 0 && row.videoUrl)
        .map((row) => [row.storyboardId, row] as const),
    ).values(),
  )
}
