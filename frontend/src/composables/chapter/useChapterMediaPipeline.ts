import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { imageAPI } from '@/composables/useApi'
import { useImageGenerationMonitor } from '@/composables/useImageGenerationMonitor'
import { useChapterAssetWorkflow } from './useChapterAssetWorkflow'
import { useChapterExportWorkflow } from './useChapterExportWorkflow'
import { useChapterVideoWorkflow } from './useChapterVideoWorkflow'
import type {
  ChapterCharacter,
  ChapterMergeData,
  ChapterScene,
  ChapterStoryboard,
  ShotFrameGeneratePayload,
  ShotFrameRestorePayload,
  ShotImageHistoryItem,
} from './chapterMediaTypes'
import { errorMessageFromUnknown } from './chapterMediaTypes'
import {
  buildDefaultVideoPrompt as buildDefaultVideoPromptText,
  buildShotImagePrompt as buildShotImagePromptText,
  getComposedVideoUrl,
  getFirstFrame,
  getLastFrame,
  getStoryboardCover,
  getStoryboardStateClass as storyboardStateClassForText,
  getStoryboardStateText as getStoryboardProductionStateText,
  getVideoGenerateActionLabel as videoGenerateActionLabelForPending,
  getVideoReferenceSummary,
  getVideoStateClass as videoStateClassForText,
  getVideoStateText as getVideoProductionStateText,
  getVideoUrl,
  hasComposedVideo,
  hasStoryboardImage,
  hasStoryboardVideo,
  parseStoryboardReferenceImages,
} from './chapterShotMediaPolicy'

interface UseChapterMediaPipelineOptions {
  dramaId: number
  epId: ComputedRef<number>
  chars: Ref<ChapterCharacter[]>
  scenes: Ref<ChapterScene[]>
  sbs: Ref<ChapterStoryboard[]>
  visualChars: ComputedRef<ChapterCharacter[]>
  selectedSb: Ref<ChapterStoryboard | null>
  mergeData?: Ref<ChapterMergeData | null>
  refresh: () => Promise<void>
  lockedImageConfigId: ComputedRef<number | null>
  lockedVideoConfigId: ComputedRef<number | null>
  shotImageResolvedSize: ComputedRef<string>
  shotImageAspectRatio: Ref<string>
  updateField: (sb: ChapterStoryboard, field: string, value: unknown) => void
  getStoryboardCharacterIds: (sb: ChapterStoryboard) => number[]
  getStoryboardCharacterNames: (sb: ChapterStoryboard) => string[]
  getSceneName: (sb: ChapterStoryboard) => string
}

export function useChapterMediaPipeline(options: UseChapterMediaPipelineOptions) {
  const pendingShotFrameKeys = ref<string[]>([])
  const shotImageHistory = ref<Record<number, ShotImageHistoryItem[]>>({})
  const { sleep, watchAsyncResult, waitForImageGeneration, waitForImageAssetUpdate } = useImageGenerationMonitor(options.refresh)
  const assetWorkflow = useChapterAssetWorkflow({
    epId: options.epId,
    chars: options.chars,
    scenes: options.scenes,
    visualChars: options.visualChars,
    refresh: options.refresh,
    watchAsyncResult,
    waitForImageGeneration,
    waitForImageAssetUpdate,
  })
  const {
    pendingCharImageIds,
    pendingSceneImageIds,
    replacingCharacterImageIds,
    replacingSceneImageIds,
    isPendingCharImage,
    isPendingSceneImage,
    isReplacingCharacterImage,
    isReplacingSceneImage,
    hasCharacterImage,
    hasSceneImage,
    getImageGenerateButtonLabel,
    getImageGenerateToastLabel,
    genCharImg,
    replaceCharImage,
    batchCharImages,
    genSceneImg,
    replaceSceneImage,
    batchSceneImages,
  } = assetWorkflow
  const videoWorkflow = useChapterVideoWorkflow({
    dramaId: options.dramaId,
    sbs: options.sbs,
    lockedVideoConfigId: options.lockedVideoConfigId,
    refresh: options.refresh,
    sleep,
    watchAsyncResult,
  })
  const {
    pendingVideoIds,
    failedVideoMessages,
    isPendingVideo,
    videoFailMessage,
    genVid,
    pollVideoGeneration,
    batchVideos,
  } = videoWorkflow
  const exportWorkflow = useChapterExportWorkflow({
    epId: options.epId,
    sbs: options.sbs,
    mergeData: options.mergeData,
  })
  const {
    isMerging,
    doMerge,
    stopMergePolling,
  } = exportWorkflow

  function framePendingKey(id: number, frameType: string) {
    return `${id}:${frameType}`
  }

  function isPendingShotFrame(id: number, frameType: string) {
    return pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))
  }

  function hasImg(storyboard: ChapterStoryboard | null | undefined) {
    return hasStoryboardImage(storyboard)
  }

  function hasVid(storyboard: ChapterStoryboard | null | undefined) {
    return hasStoryboardVideo(storyboard)
  }

  function hasComposed(storyboard: ChapterStoryboard | null | undefined) {
    return hasComposedVideo(storyboard)
  }

  function getRefs(storyboard: ChapterStoryboard | null | undefined) {
    return parseStoryboardReferenceImages(storyboard)
  }

  function getShotReferenceImages(storyboard: ChapterStoryboard) {
    const refs: string[] = []
    const pushRef = (value: string | null | undefined) => {
      if (!value || refs.includes(value) || refs.length >= 6) return
      refs.push(value)
    }

    const sceneId = storyboard?.scene_id || storyboard?.sceneId
    const scene = options.scenes.value.find(item => item.id === sceneId)
    pushRef(scene?.image_url || scene?.imageUrl)

    for (const charId of options.getStoryboardCharacterIds(storyboard)) {
      const char = options.chars.value.find(item => item.id === charId)
      pushRef(char?.image_url || char?.imageUrl)
    }

    for (const ref of getRefs(storyboard)) pushRef(ref)
    return refs.filter(Boolean).slice(0, 6)
  }

  function getShotManualReferenceImages(storyboard: ChapterStoryboard) {
    return getRefs(storyboard).filter(Boolean).slice(0, 6)
  }

  function pushShotImageHistory(storyboardId: number, frameType: string, src: string | null | undefined) {
    if (!storyboardId || !frameType || !src) return
    const current = shotImageHistory.value[storyboardId] || []
    if (current.some(item => item.frameType === frameType && item.src === src)) return
    shotImageHistory.value = {
      ...shotImageHistory.value,
      [storyboardId]: [{ frameType, src, createdAt: Date.now() }, ...current].slice(0, 12),
    }
  }

  function removeShotImageHistory(storyboardId: number, frameType: string, src: string) {
    const current = shotImageHistory.value[storyboardId] || []
    shotImageHistory.value = {
      ...shotImageHistory.value,
      [storyboardId]: current.filter(item => !(item.frameType === frameType && item.src === src)),
    }
  }

  function buildShotImagePrompt(
    storyboard: ChapterStoryboard,
    frameType: string,
    aspectRatio = options.shotImageAspectRatio.value,
  ) {
    return buildShotImagePromptText({
      storyboard,
      frameType,
      aspectRatio,
      characterNames: options.getStoryboardCharacterNames(storyboard),
      sceneName: options.getSceneName(storyboard),
    })
  }

  function buildDefaultVideoPrompt(storyboard: ChapterStoryboard | null | undefined) {
    return buildDefaultVideoPromptText(storyboard)
  }

  function getStoryboardStateText(storyboard: ChapterStoryboard | null | undefined) {
    return getStoryboardProductionStateText({
      storyboard,
      pendingVideo: !!storyboard?.id && isPendingVideo(storyboard.id),
    })
  }

  function getStoryboardStateClass(storyboard: ChapterStoryboard | null | undefined) {
    return storyboardStateClassForText(getStoryboardStateText(storyboard))
  }

  function getVideoGenerateActionLabel(storyboard: ChapterStoryboard) {
    return videoGenerateActionLabelForPending(isPendingVideo(storyboard.id))
  }

  function getVideoStateText(storyboard: ChapterStoryboard | null | undefined) {
    return getVideoProductionStateText({
      storyboard,
      pendingVideo: !!storyboard?.id && isPendingVideo(storyboard.id),
    })
  }

  function getVideoStateClass(storyboard: ChapterStoryboard | null | undefined) {
    return videoStateClassForText(getVideoStateText(storyboard))
  }

  const activeVideoSb = computed(() => options.selectedSb.value || options.sbs.value[0] || null)
  const activeVideoShotIndex = computed(() => activeVideoSb.value ? options.sbs.value.findIndex(sb => sb.id === activeVideoSb.value.id) : -1)
  const activeVideoShotIndexLabel = computed(() => String(activeVideoShotIndex.value + 1).padStart(2, '0'))

  async function genShotFrame(storyboard: ChapterStoryboard, frameType: string) {
    const prompt = buildShotImagePrompt(storyboard, frameType, options.shotImageAspectRatio.value)
    const referenceImages = getShotReferenceImages(storyboard)
    const key = framePendingKey(storyboard.id, frameType)
    const previousImage = frameType === 'first_frame' ? getFirstFrame(storyboard) : getLastFrame(storyboard)
    const isReroll = !!previousImage
    if (previousImage) pushShotImageHistory(storyboard.id, frameType, previousImage)
    try {
      if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
      const generation = await imageAPI.generate({
        storyboard_id: storyboard.id,
        drama_id: options.dramaId,
        config_id: options.lockedImageConfigId.value || undefined,
        prompt,
        size: options.shotImageResolvedSize.value,
        frame_type: frameType,
        reference_images: referenceImages.length ? referenceImages : undefined,
      })
      toast.success(getImageGenerateToastLabel(isReroll, frameType === 'first_frame' ? '首帧' : '尾帧'))
      const generationId = Number(generation?.id || 0)
      if (generationId) {
        await waitForImageGeneration(generationId)
        await waitForImageAssetUpdate(() => {
          const target = options.sbs.value.find(s => s.id === storyboard.id)
          return frameType === 'first_frame' ? getFirstFrame(target) : getLastFrame(target)
        }, previousImage, 12, 1000)
      } else {
        await waitForImageAssetUpdate(() => {
          const target = options.sbs.value.find(s => s.id === storyboard.id)
          return frameType === 'first_frame' ? getFirstFrame(target) : getLastFrame(target)
        }, previousImage)
      }
      pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
    } catch (error: unknown) {
      pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
      toast.error(errorMessageFromUnknown(error))
    }
  }

  function handleShotFrameGenerate(payload: ShotFrameGeneratePayload) {
    if (!payload?.sb || !payload?.frameType) return
    const quantity = Math.max(1, Math.min(4, Number(payload.quantity) || 1))
    for (let i = 0; i < quantity; i++) void genShotFrame(payload.sb, payload.frameType)
  }

  function handleShotFrameRestore(payload: ShotFrameRestorePayload) {
    if (!payload?.sb || !payload?.frameType || !payload?.src) return
    const field = payload.frameType === 'last_frame' ? 'last_frame_image' : 'first_frame_image'
    const current = payload.frameType === 'last_frame' ? getLastFrame(payload.sb) : getFirstFrame(payload.sb)
    pushShotImageHistory(payload.sb.id, payload.frameType, current)
    options.updateField(payload.sb, field, payload.src)
    removeShotImageHistory(payload.sb.id, payload.frameType, payload.src)
    toast.success('已替换为历史图片')
  }

  return {
    pendingCharImageIds,
    pendingSceneImageIds,
    replacingCharacterImageIds,
    replacingSceneImageIds,
    pendingShotFrameKeys,
    pendingVideoIds,
    isMerging,
    failedVideoMessages,
    shotImageHistory,
    isPendingCharImage,
    isPendingSceneImage,
    isReplacingCharacterImage,
    isReplacingSceneImage,
    hasCharacterImage,
    hasSceneImage,
    getImageGenerateButtonLabel,
    getImageGenerateToastLabel,
    framePendingKey,
    isPendingShotFrame,
    isPendingVideo,
    videoFailMessage,
    getStoryboardStateText,
    getStoryboardStateClass,
    getVideoGenerateActionLabel,
    getVideoStateText,
    getVideoStateClass,
    getVideoReferenceSummary,
    buildDefaultVideoPrompt,
    activeVideoSb,
    activeVideoShotIndex,
    activeVideoShotIndexLabel,
    getFirstFrame,
    getLastFrame,
    getStoryboardCover,
    getVideoUrl,
    getComposedVideoUrl,
    hasImg,
    hasVid,
    hasComposed,
    getShotReferenceImages,
    getShotManualReferenceImages,
    getRefs,
    pushShotImageHistory,
    removeShotImageHistory,
    buildShotImagePrompt,
    genCharImg,
    replaceCharImage,
    batchCharImages,
    genSceneImg,
    replaceSceneImage,
    batchSceneImages,
    genShotFrame,
    genVid,
    pollVideoGeneration,
    batchVideos,
    doMerge,
    stopMergePolling,
    handleShotFrameGenerate,
    handleShotFrameRestore,
  }
}
