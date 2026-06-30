import { onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { mergeAPI } from '@/composables/useApi'
import type {
  ChapterMergeData,
  ChapterStoryboard,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'
import {
  getComposedVideoUrl,
  getVideoUrl,
  hasComposedVideo,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'

const MERGE_POLL_INTERVAL_MS = 3000

type ChapterExportWorkflowOptions = {
  epId: ComputedRef<number>
  sbs: Ref<ChapterStoryboard[]>
  mergeData?: Ref<ChapterMergeData | null>
}

export function useChapterExportWorkflow(options: ChapterExportWorkflowOptions) {
  const isMerging = ref(false)
  let mergePollHandle: ReturnType<typeof setInterval> | null = null
  let mergePollRunning = false

  function stopMergePolling() {
    if (!mergePollHandle) return
    clearInterval(mergePollHandle)
    mergePollHandle = null
  }

  function isTerminalMergeStatus(status: unknown) {
    return status === 'completed' || status === 'failed'
  }

  function getMergeClipUrl(storyboard: ChapterStoryboard) {
    return getVideoUrl(storyboard) || getComposedVideoUrl(storyboard) || ''
  }

  async function pollMergeStatus() {
    if (!options.epId.value || mergePollRunning) return
    mergePollRunning = true
    try {
      const mergeData = await mergeAPI.status(options.epId.value) as ChapterMergeData | null
      if (options.mergeData) options.mergeData.value = mergeData
      if (!mergeData) {
        stopMergePolling()
        isMerging.value = false
        return
      }
      if (isTerminalMergeStatus(mergeData.status)) {
        stopMergePolling()
        isMerging.value = false
        mergeData.status === 'completed'
          ? toast.success('视频拼接完成')
          : toast.error(mergeData?.error_msg || mergeData?.errorMsg || '拼接失败')
      }
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '查询拼接状态失败'))
    } finally {
      mergePollRunning = false
    }
  }

  function startMergePolling() {
    if (!options.epId.value) return
    isMerging.value = true
    if (mergePollHandle) return
    mergePollHandle = setInterval(() => {
      void pollMergeStatus()
    }, MERGE_POLL_INTERVAL_MS)
  }

  watch(
    () => ({
      episodeId: options.epId.value,
      mergeId: options.mergeData?.value?.id || options.mergeData?.value?.merge_id || null,
      status: options.mergeData?.value?.status || null,
    }),
    ({ episodeId, status }) => {
      if (!episodeId) {
        stopMergePolling()
        isMerging.value = false
        return
      }
      if (status === 'processing') {
        startMergePolling()
        return
      }
      if (isTerminalMergeStatus(status)) {
        stopMergePolling()
        isMerging.value = false
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stopMergePolling()
  })

  async function doMerge(storyboardIds?: number[]) {
    const selectedIds = Array.isArray(storyboardIds)
      ? Array.from(new Set(storyboardIds.map(Number).filter(Number.isFinite)))
      : undefined
    const clipStoryboards = options.sbs.value
      .filter(storyboard => hasComposedVideo(storyboard) || hasStoryboardVideo(storyboard))
      .filter(storyboard => !selectedIds || selectedIds.includes(Number(storyboard.id)))

    if (clipStoryboards.length === 0) {
      toast.error(selectedIds ? '请先选择至少 1 个已生成视频的镜头' : '请先至少生成 1 个镜头视频')
      return
    }
    if (isMerging.value || options.mergeData?.value?.status === 'processing') {
      toast.info('视频正在拼接中')
      return
    }

    try {
      isMerging.value = true
      stopMergePolling()
      const storyboardIds = clipStoryboards.map(storyboard => Number(storyboard.id))
      const clips = clipStoryboards
        .map(storyboard => ({
          storyboard_id: Number(storyboard.id),
          video_url: getMergeClipUrl(storyboard),
        }))
        .filter(clip => Number.isFinite(clip.storyboard_id) && clip.video_url)
      const mergeResult = await mergeAPI.merge(options.epId.value, storyboardIds, clips)
      if (options.mergeData) {
        const mergeId = Number(mergeResult?.merge_id || mergeResult?.mergeId || 0) || undefined
        options.mergeData.value = {
          ...(options.mergeData.value || {}),
          id: mergeId,
          merge_id: mergeId,
          status: 'processing',
        }
      }
      toast.success('正在拼接视频...')
      startMergePolling()
    } catch (error: unknown) {
      stopMergePolling()
      isMerging.value = false
      toast.error(errorMessageFromUnknown(error, '拼接启动失败'))
    }
  }

  return {
    isMerging,
    doMerge,
    stopMergePolling,
  }
}
