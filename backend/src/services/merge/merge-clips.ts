export type MergeClipStoryboard = {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
  mergeVideoUrl: string
}

export type MergeClipOverride = {
  storyboardId: number
  videoUrl: string
}

function normalizeMergeClipOverrideMap(overrides?: MergeClipOverride[]) {
  const entries = (overrides || [])
    .map(override => ({
      storyboardId: Number(override?.storyboardId || 0),
      videoUrl: String(override?.videoUrl || '').trim(),
    }))
    .filter(override => Number.isInteger(override.storyboardId) && override.storyboardId > 0 && override.videoUrl)
    .map(override => [override.storyboardId, override.videoUrl] as const)
  return new Map(entries)
}

export function selectMergeClipStoryboards<T extends {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
}>(
  storyboards: T[],
  selectedStoryboardIds?: number[],
  selectedClipOverrides?: MergeClipOverride[],
): Array<T & MergeClipStoryboard> {
  const selectedIds = Array.isArray(selectedStoryboardIds)
    ? new Set(selectedStoryboardIds.map(Number).filter(Number.isFinite))
    : null
  const overrideByStoryboardId = normalizeMergeClipOverrideMap(selectedClipOverrides)

  return storyboards
    .filter(storyboard => !selectedIds || selectedIds.has(Number(storyboard.id)))
    .map((storyboard) => {
      const mergeVideoUrl = overrideByStoryboardId.get(Number(storyboard.id)) || storyboard.videoUrl || storyboard.composedVideoUrl || ''
      return mergeVideoUrl ? { ...storyboard, mergeVideoUrl } : null
    })
    .filter((storyboard): storyboard is T & MergeClipStoryboard => !!storyboard)
}
