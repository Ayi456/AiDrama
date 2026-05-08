import { onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { mergeAPI } from '@/composables/useApi'
import type {
  ChapterMergeData,
  ChapterStoryboard,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'
import {
  hasComposedVideo,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'

type ChapterExportWorkflowOptions = {
  epId: ComputedRef<number>
  sbs: Ref<ChapterStoryboard[]>
  mergeData?: Ref<ChapterMergeData | null>
}

export function useChapterExportWorkflow(options: ChapterExportWorkflowOptions) {
  const isMerging = ref(false)
  let mergePollHandle: ReturnType<typeof setInterval> | null = null

  function stopMergePolling() {
    if (!mergePollHandle) return
    clearInterval(mergePollHandle)
    mergePollHandle = null
  }

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
    if (isMerging.value) {
      toast.info('视频正在拼接中')
      return
    }

    try {
      isMerging.value = true
      stopMergePolling()
      const mergeResult = await mergeAPI.merge(options.epId.value, clipStoryboards.map(storyboard => Number(storyboard.id)))
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
      mergePollHandle = setInterval(async () => {
        try {
          const mergeData = await mergeAPI.status(options.epId.value) as ChapterMergeData
          if (options.mergeData) options.mergeData.value = mergeData
          if (mergeData?.status === 'completed' || mergeData?.status === 'failed') {
            stopMergePolling()
            isMerging.value = false
            mergeData.status === 'completed'
              ? toast.success('视频拼接完成')
              : toast.error(mergeData?.error_msg || mergeData?.errorMsg || '拼接失败')
          }
        } catch (error: unknown) {
          toast.error(errorMessageFromUnknown(error, '查询拼接状态失败'))
        }
      }, 3000)
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
