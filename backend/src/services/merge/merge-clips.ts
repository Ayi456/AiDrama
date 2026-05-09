export type MergeClipStoryboard = {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
  mergeVideoUrl: string
}

export function selectMergeClipStoryboards<T extends {
  id: number
  storyboardNumber: number | null
  videoUrl?: string | null
  composedVideoUrl?: string | null
}>(storyboards: T[], selectedStoryboardIds?: number[]): Array<T & MergeClipStoryboard> {
  const selectedIds = Array.isArray(selectedStoryboardIds)
    ? new Set(selectedStoryboardIds.map(Number).filter(Number.isFinite))
    : null

  return storyboards
    .filter(storyboard => !selectedIds || selectedIds.has(Number(storyboard.id)))
    .map((storyboard) => {
      const mergeVideoUrl = storyboard.videoUrl || storyboard.composedVideoUrl || ''
      return mergeVideoUrl ? { ...storyboard, mergeVideoUrl } : null
    })
    .filter((storyboard): storyboard is T & MergeClipStoryboard => !!storyboard)
}
