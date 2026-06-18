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
  getVideoUrl,
  hasStoryboardVideo,
} from './chapterShotMediaPolicy'
import {
  VIDEO_CLIENT_POLL_ATTEMPTS,
  VIDEO_CLIENT_POLL_DELAY_MS,
  getVideoPollGenerationUrl,
  hasNewStoryboardVideo,
  resolveVideoPollExhaustedOutcome,
  resolveVideoPollOutcome,
} from './chapterVideoPollingPolicy'
import {
  getPendingVideoHistoryGeneration,
  getVideoHistoryUrl,
  normalizeVideoHistory,
  shouldApplyVideoHistoryLoadResult,
} from './chapterVideoHistoryPolicy'

type VideoMonitor = {
  sleep: (ms: number) => Promise<unknown>
  watchAsyncResult: (check: () => boolean, attempts?: number, delay?: number) => void
}

export type VideoBillingSnapshot = {
  generationId: number
  status: string
  billedSeconds: string
  billingAmount: string
  message: string
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
  const videoBillingByStoryboard = ref<Record<number, VideoBillingSnapshot>>({})
  const videoHistory = ref<Record<number, VideoGeneration[]>>({})
  const loadingVideoHistoryIds = ref<number[]>([])
  const videoHistoryLoadTokens = ref<Record<number, number>>({})
  const pollingVideoGenerationIds = new Set<number>()

  function isPendingVideo(id: number) {
    return pendingVideoIds.value.includes(id)
  }

  function addPendingVideo(storyboardId: number) {
    if (!isPendingVideo(storyboardId)) {
      pendingVideoIds.value = [...pendingVideoIds.value, storyboardId]
    }
  }

  function removePendingVideo(storyboardId: number) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  }

  function videoFailMessage(id: number) {
    return failedVideoMessages.value[id] || ''
  }

  const videoHistoryUrl = getVideoHistoryUrl

  function videoBillingInfo(id: number) {
    return videoBillingByStoryboard.value[Number(id)] || null
  }

  function readVideoBillingSnapshot(generation: VideoGeneration, generationId: number): VideoBillingSnapshot | null {
    const status = String(generation?.billing_status || generation?.billingStatus || '').trim()
    const billedSeconds = String(generation?.billed_seconds || generation?.billedSeconds || '').trim()
    const billingAmount = String(generation?.billing_amount || generation?.billingAmount || '').trim()
    const message = String(generation?.billing_error || generation?.billingError || '').trim()
    if (!status && !billedSeconds && !billingAmount && !message) return null
    return {
      generationId,
      status: status || 'billing',
      billedSeconds: billedSeconds || '0.00',
      billingAmount: billingAmount || '0.00',
      message,
    }
  }

  function recordVideoBilling(storyboardId: number, generation: VideoGeneration, generationId: number) {
    const snapshot = readVideoBillingSnapshot(generation, generationId)
    if (!snapshot) return
    videoBillingByStoryboard.value = {
      ...videoBillingByStoryboard.value,
      [storyboardId]: snapshot,
    }
  }

  function recordVideoHistoryBilling(storyboardId: number, rows: VideoGeneration[]) {
    rows.forEach((row) => {
      const generationId = Number(
        row?.effective_generation_id ||
        row?.effectiveGenerationId ||
        row?.regeneration_id ||
        row?.regenerationId ||
        row?.id ||
        0,
      )
      recordVideoBilling(storyboardId, row, generationId)
    })
  }

  function startVideoGenerationPolling(generationId: number, storyboardId: number, previousVideoUrl = '') {
    if (!generationId) {
      void pollVideoGeneration(generationId, storyboardId, previousVideoUrl)
      return
    }
    if (pollingVideoGenerationIds.has(generationId)) return
    pollingVideoGenerationIds.add(generationId)
    void pollVideoGeneration(generationId, storyboardId, previousVideoUrl)
      .finally(() => {
        pollingVideoGenerationIds.delete(generationId)
      })
  }

  function restorePendingVideoFromHistory(storyboardId: number, rows: VideoGeneration[]) {
    const pending = getPendingVideoHistoryGeneration(rows)
    if (!pending) return

    addPendingVideo(storyboardId)
    const target = options.sbs.value.find(s => Number(s.id) === storyboardId)
    startVideoGenerationPolling(pending.generationId, storyboardId, getVideoUrl(target) || '')
  }

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
      recordVideoHistoryBilling(id, rows || [])
      restorePendingVideoFromHistory(id, rows || [])
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
    const previousVideoUrl = getVideoUrl(storyboard) || ''
    try {
      delete failedVideoMessages.value[storyboardId]
      addPendingVideo(storyboardId)
      const generation = await videoAPI.generate(params)
      recordVideoBilling(storyboardId, generation, Number(generation?.id || 0))
      toast.success('视频生成中')
      await options.refresh()
      startVideoGenerationPolling(Number(generation?.id || 0), storyboardId, previousVideoUrl)
    } catch (error: unknown) {
      removePendingVideo(storyboardId)
      toast.error(errorMessageFromUnknown(error))
    }
  }

  async function pollVideoGeneration(generationId: number, storyboardId: number, previousVideoUrl = '') {
    if (!generationId) {
      options.watchAsyncResult(() => {
        const target = options.sbs.value.find(s => s.id === storyboardId)
        const done = hasNewStoryboardVideo(getVideoUrl(target), previousVideoUrl)
        if (done) removePendingVideo(storyboardId)
        return done
      }, 60, 4000)
      return
    }

    for (let i = 0; i < VIDEO_CLIENT_POLL_ATTEMPTS; i++) {
      await options.sleep(VIDEO_CLIENT_POLL_DELAY_MS)
      try {
        const res = await videoAPI.get(generationId)
        recordVideoBilling(storyboardId, res, generationId)
        await options.refresh()
        const target = options.sbs.value.find(s => Number(s.id) === storyboardId)
        const targetVideoUrl = getVideoUrl(target)
        const outcome = resolveVideoPollOutcome(res, {
          storyboardHasVideo: hasNewStoryboardVideo(targetVideoUrl, previousVideoUrl),
        })
        if (outcome.type === 'completed') {
          const completedUrl = getVideoPollGenerationUrl(res)
          if (target && completedUrl && targetVideoUrl !== completedUrl) {
            await options.updateField(target, 'video_url', completedUrl)
          }
          removePendingVideo(storyboardId)
          delete failedVideoMessages.value[storyboardId]
          await loadVideoHistory(storyboardId)
          toast.success('视频生成完成')
          return
        }
        if (outcome.type === 'failed') {
          removePendingVideo(storyboardId)
          failedVideoMessages.value = {
            ...failedVideoMessages.value,
            [storyboardId]: outcome.message,
          }
          toast.error(failedVideoMessages.value[storyboardId])
          return
        }
        if (outcome.type === 'billing_required') {
          removePendingVideo(storyboardId)
          failedVideoMessages.value = {
            ...failedVideoMessages.value,
            [storyboardId]: outcome.message,
          }
          toast.warning(outcome.message)
          return
        }
      } catch {}
    }

    removePendingVideo(storyboardId)
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
      if (done) removePendingVideo(id)
      return done
    }), 80, 4000)
  }

  async function retryVideoBilling(storyboardId: number) {
    const snapshot = videoBillingInfo(storyboardId)
    const generationId = Number(snapshot?.generationId || 0)
    if (!generationId) {
      toast.warning('没有可重试的结算任务')
      return
    }

    try {
      const generation = await videoAPI.retryBilling(generationId)
      recordVideoBilling(storyboardId, generation, generationId)
      delete failedVideoMessages.value[storyboardId]
      await options.refresh()
      await loadVideoHistory(storyboardId)
      toast.success('视频结算已重试')
    } catch (error: unknown) {
      toast.error(errorMessageFromUnknown(error, '重试结算失败'))
    }
  }

  return {
    pendingVideoIds,
    failedVideoMessages,
    videoBillingByStoryboard,
    videoHistory,
    loadingVideoHistoryIds,
    isPendingVideo,
    videoFailMessage,
    videoBillingInfo,
    getVideoHistory,
    isVideoHistoryLoading,
    loadVideoHistory,
    restoreVideoFromHistory,
    videoHistoryUrl,
    genVid,
    pollVideoGeneration,
    batchVideos,
    retryVideoBilling,
  }
}
