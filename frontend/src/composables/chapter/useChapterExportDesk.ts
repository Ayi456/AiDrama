import { computed, ref, watch, type Ref } from 'vue'
import type {
  ChapterMergeData,
  ChapterStoryboard,
} from './chapterMediaTypes'
import {
  hasComposedVideo,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'

type ChapterExportDeskOptions = {
  sbs: Ref<ChapterStoryboard[]>
  mergeData: Ref<ChapterMergeData | null>
  isMerging: Ref<boolean>
  doMerge: (storyboardIds?: number[]) => void | Promise<void>
}

type MergeSelectionPayload = {
  storyboardIds?: number[]
}

export function useChapterExportDesk(options: ChapterExportDeskOptions) {
  const selectedMergeStoryboardIds = ref<number[]>([])
  const mergeSelectionInitialized = ref(false)

  function hasMergeClip(storyboard: ChapterStoryboard | null | undefined) {
    return hasComposedVideo(storyboard) || hasStoryboardVideo(storyboard)
  }

  const mergeClipCount = computed(() => options.sbs.value.filter(hasMergeClip).length)
  const mergeUrl = computed(() => options.mergeData.value?.merged_url || options.mergeData.value?.mergedUrl || null)
  const mergeableStoryboardIds = computed(() => options.sbs.value
    .filter(hasMergeClip)
    .map(storyboard => Number(storyboard.id))
    .filter(Number.isFinite))
  const mergeBusy = computed(() => options.isMerging.value || options.mergeData.value?.status === 'processing')

  watch(mergeableStoryboardIds, (ids, previousIds = []) => {
    if (!ids.length) {
      selectedMergeStoryboardIds.value = []
      return
    }

    const current = selectedMergeStoryboardIds.value.map(Number)
    const hadAllPrevious = previousIds.length > 0 && previousIds.every(id => current.includes(Number(id)))
    if (!mergeSelectionInitialized.value || hadAllPrevious) {
      selectedMergeStoryboardIds.value = [...ids]
      mergeSelectionInitialized.value = true
      return
    }

    selectedMergeStoryboardIds.value = current.filter(id => ids.includes(id))
  }, { immediate: true })

  function handleMergeSelectionUpdate(ids: unknown) {
    selectedMergeStoryboardIds.value = Array.isArray(ids)
      ? ids.map(Number).filter(Number.isFinite)
      : []
  }

  function handleMergeSelected(payload?: MergeSelectionPayload | null) {
    const ids = Array.isArray(payload?.storyboardIds) ? payload.storyboardIds : selectedMergeStoryboardIds.value
    void options.doMerge(ids)
  }

  return {
    selectedMergeStoryboardIds,
    hasMergeClip,
    mergeClipCount,
    mergeUrl,
    mergeBusy,
    handleMergeSelectionUpdate,
    handleMergeSelected,
  }
}
