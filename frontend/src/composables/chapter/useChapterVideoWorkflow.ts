import { ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { videoAPI, type VideoGeneration } from '@/composables/useApi'
import type {
  ChapterStoryboard,
  VideoReferenceOverride,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'
import {
  buildVideoGeneratePayload,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'
import {
  VIDEO_CLIENT_POLL_ATTEMPTS,
  VIDEO_CLIENT_POLL_DELAY_MS,
  resolveVideoPollExhaustedOutcome,
  resolveVideoPollOutcome,
} from './chapterVideoPollingPolicy'
import {
  getVideoHistoryUrl,
  normalizeVideoHistory,
  shouldApplyVideoHistoryLoadResult,
} from './chapterVideoHistoryPolicy'

type VideoMonitor = {
  sleep: (ms: number) => Promise<unknown>
  watchAsyncResult: (check: () => boolean, attempts?: number, delay?: number) => void
}

type ChapterVideoWorkflowOptions = VideoMonitor & {
  dramaId: number
  sbs: Ref<ChapterStoryboard[]>
  lockedVideoConfigId: ComputedRef<number | null>
  refresh: () => Promise<void>
  updateField: (storyboard: ChapterStoryboard, field: string, value: unknown) => void | Promise<unknown>
}

export function useChapterVideoWorkflow(options: ChapterVideoWorkflowOptions) {
  const pendingVideoIds = ref<number[]>([])
  const failedVideoMessages = ref<Record<number, string>>({})
  const videoHistory = ref<Record<number, VideoGeneration[]>>({})
  const loadingVideoHistoryIds = ref<number[]>([])
  const videoHistoryLoadTokens = ref<Record<number, number>>({})

  function isPendingVideo(id: number) {
    return pendingVideoIds.value.includes(id)
  }

  function videoFailMessage(id: number) {
    return failedVideoMessages.value[id] || ''
  }

  const videoHistoryUrl = getVideoHistoryUrl

  function getVideoHistory(storyboardId: number) {
    return videoHistory.value[Number(storyboardId)] || []
  }

  function isVideoHistoryLoading(storyboardId: number) {
    return loadingVideoHistoryIds.value.includes(Number(storyboardId))
  }

  async function loadVideoHistory(storyboardId: number) {
    const id = Number(storyboardId)
    if (!id) return

    const token = Number(videoHistoryLoadTokens.value[id] || 0) + 1
    videoHistoryLoadTokens.value = {
      ...videoHistoryLoadTokens.value,
      [id]: token,
    }

    loadingVideoHistoryIds.value = [...new Set([...loadingVideoHistoryIds.value, id])]
    try {
      const rows = await videoAPI.list({ storyboard_id: id })
      if (!shouldApplyVideoHistoryLoadResult(videoHistoryLoadTokens.value, id, token)) return
      videoHistory.value = {
        ...videoHistory.value,
        [id]: normalizeVideoHistory(rows || []),
      }
    } catch (error: unknown) {
      if (shouldApplyVideoHistoryLoadResult(videoHistoryLoadTokens.value, id, token)) {
        toast.error(errorMessageFromUnknown(error, '视频历史加载失败'))
      }
    } finally {
      if (shouldApplyVideoHistoryLoadResult(videoHistoryLoadTokens.value, id, token)) {
        loadingVideoHistoryIds.value = loadingVideoHistoryIds.value.filter(item => item !== id)
      }
    }
  }

  async function restoreVideoFromHistory(storyboard: ChapterStoryboard, item: VideoGeneration) {
    const url = videoHistoryUrl(item)
    if (!storyboard?.id || !url) return

    try {
      await options.updateField(storyboard, 'video_url', url)
      await options.refresh()
      toast.success('已切换为历史视频')
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '历史视频切换失败'))
    }
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

    for (let i = 0; i < VIDEO_CLIENT_POLL_ATTEMPTS; i++) {
      await options.sleep(VIDEO_CLIENT_POLL_DELAY_MS)
      try {
        const res = await videoAPI.get(generationId)
        await options.refresh()
        const target = options.sbs.value.find(s => Number(s.id) === storyboardId)
        const outcome = resolveVideoPollOutcome(res, {
          storyboardHasVideo: hasStoryboardVideo(target),
        })
        if (outcome.type === 'completed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          delete failedVideoMessages.value[storyboardId]
          await loadVideoHistory(storyboardId)
          toast.success('视频生成完成')
          return
        }
        if (outcome.type === 'failed') {
          pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
          failedVideoMessages.value = {
            ...failedVideoMessages.value,
            [storyboardId]: outcome.message,
          }
          toast.error(failedVideoMessages.value[storyboardId])
          return
        }
      } catch {}
    }

    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
    const exhaustedOutcome = resolveVideoPollExhaustedOutcome()
    delete failedVideoMessages.value[storyboardId]
    toast.info(exhaustedOutcome.message)
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
    videoHistory,
    loadingVideoHistoryIds,
    isPendingVideo,
    videoFailMessage,
    getVideoHistory,
    isVideoHistoryLoading,
    loadVideoHistory,
    restoreVideoFromHistory,
    videoHistoryUrl,
    genVid,
    pollVideoGeneration,
    batchVideos,
  }
}
