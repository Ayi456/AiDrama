import { ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { videoAPI } from '@/composables/useApi'
import type {
  ChapterStoryboard,
  VideoReferenceOverride,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'
import {
  buildVideoGeneratePayload,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'

type VideoMonitor = {
  sleep: (ms: number) => Promise<unknown>
  watchAsyncResult: (check: () => boolean, attempts?: number, delay?: number) => void
}

type ChapterVideoWorkflowOptions = VideoMonitor & {
  dramaId: number
  sbs: Ref<ChapterStoryboard[]>
  lockedVideoConfigId: ComputedRef<number | null>
  refresh: () => Promise<void>
}

export function useChapterVideoWorkflow(options: ChapterVideoWorkflowOptions) {
  const pendingVideoIds = ref<number[]>([])
  const failedVideoMessages = ref<Record<number, string>>({})

  function isPendingVideo(id: number) {
    return pendingVideoIds.value.includes(id)
  }

  function videoFailMessage(id: number) {
    return failedVideoMessages.value[id] || ''
  }

  async function genVid(storyboard: ChapterStoryboard, optionsOverride: VideoReferenceOverride = {}) {
    const params = buildVideoGeneratePayload({
      storyboard,
      dramaId: options.dramaId,
      configId: options.lockedVideoConfigId.value || undefined,
      override: optionsOverride,
    })
    const storyboardId = Number(storyboard.id)
    try {
      delete failedVideoMessages.value[storyboardId]
      if (!isPendingVideo(storyboardId)) pendingVideoIds.value.push(storyboardId)
      const generation = await videoAPI.generate(params)
      toast.success('视频生成中')
      await options.refresh()
      void pollVideoGeneration(Number(generation?.id || 0), storyboardId)
    } catch (error: unknown) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
      toast.error(errorMessageFromUnknown(error))
    }
  }

  async function pollVideoGeneration(generationId: number, storyboardId: number) {
    if (!generationId) {
      options.watchAsyncResult(() => {
        const target = options.sbs.value.find(s => s.id === storyboardId)
        const done = hasStoryboardVideo(target)
        if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        return done
      }, 60, 4000)
      return
    }

    for (let i = 0; i < 120; i++) {
      await options.sleep(4000)
      try {
        const res = await videoAPI.get(generationId)
        await options.refresh()
        if (res?.status === 'completed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          delete failedVideoMessages.value[storyboardId]
          toast.success('视频生成完成')
          return
        }
        if (res?.status === 'failed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          failedVideoMessages.value = {
            ...failedVideoMessages.value,
            [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
          }
          toast.error(failedVideoMessages.value[storyboardId])
          return
        }
      } catch {}
    }

    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
    failedVideoMessages.value = {
      ...failedVideoMessages.value,
      [storyboardId]: '视频生成超时',
    }
    toast.error('视频生成超时')
  }

  function batchVideos() {
    const pendingIds = options.sbs.value
      .filter(storyboard => !hasStoryboardVideo(storyboard))
      .map(storyboard => Number(storyboard.id))
      .filter(Number.isFinite)

    pendingIds.forEach(id => {
      const storyboard = options.sbs.value.find(item => item.id === id)
      if (storyboard) void genVid(storyboard)
    })
    if (!pendingIds.length) return
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
    options.watchAsyncResult(() => pendingIds.every(id => {
      const target = options.sbs.value.find(s => s.id === id)
      const done = hasStoryboardVideo(target)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  }

  return {
    pendingVideoIds,
    failedVideoMessages,
    isPendingVideo,
    videoFailMessage,
    genVid,
    pollVideoGeneration,
    batchVideos,
  }
}
