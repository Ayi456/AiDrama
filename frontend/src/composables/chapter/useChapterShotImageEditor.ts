import { computed, ref, watch } from 'vue'

import type { ShotImageHistoryItem } from './chapterMediaTypes.ts'
import {
  deriveShotPrompt,
  resolveFrameAspectRatio,
  type ShotImageStoryboard,
} from './chapterShotImageWorkbenchPolicy.ts'

type ReferenceOption = { type?: string; src?: string }
type WorkbenchEvent =
  | 'update-shot-field'
  | 'generate-shot-frame'
  | 'restore-shot-frame'

export type ChapterShotImageEditorDependencies = {
  storyboards: () => ShotImageStoryboard[]
  selectedStoryboardId: () => number
  aspectRatio: () => string
  frameMode: () => string
  generatedCount: () => number
  referenceOptions: () => ReferenceOption[]
  history: () => Record<number, ShotImageHistoryItem[]>
  getFirstFrame: (storyboard: ShotImageStoryboard) => string
  getLastFrame: (storyboard: ShotImageStoryboard) => string
  getReferenceImages: (storyboard: ShotImageStoryboard) => string[]
  getManualReferenceImages: ((storyboard: ShotImageStoryboard) => string[]) | null
  isPendingFrame: (storyboardId: number | undefined, frameType: string) => boolean
  emit: (event: WorkbenchEvent, payload: unknown) => void
  openImage: (src: string, title: string) => void
  resolveAssetUrl: (src: string) => string
}

export function useChapterShotImageEditor(deps: ChapterShotImageEditorDependencies) {
  const selectedShot = computed(() => (
    deps.storyboards().find(storyboard => storyboard.id === deps.selectedStoryboardId()) || deps.storyboards()[0] || null
  ))
  const generationQuantity = ref(1)
  const referencePickerOpen = ref(false)
  const referencePickerTab = ref('character')
  const selectedShotIndex = computed(() => {
    if (!selectedShot.value) return -1
    return deps.storyboards().findIndex(storyboard => storyboard.id === selectedShot.value?.id)
  })
  const selectedShotIndexLabel = computed(() => String(selectedShotIndex.value + 1).padStart(2, '0'))
  const frameCardAspectRatio = computed(() => resolveFrameAspectRatio(deps.aspectRatio()))
  const promptDraft = ref('')
  const negativePromptDraft = ref('')

  const getFrameImage = (storyboard: ShotImageStoryboard, frameType: string) => (
    frameType === 'last_frame' ? deps.getLastFrame(storyboard) : deps.getFirstFrame(storyboard)
  )
  const getShotCover = (storyboard: ShotImageStoryboard) => (
    storyboard.composed_image || storyboard.composedImage || getFrameImage(storyboard, 'first_frame') || getFrameImage(storyboard, 'last_frame') || ''
  )
  const hasFrameByType = (storyboard: ShotImageStoryboard, frameType: string) => Boolean(getFrameImage(storyboard, frameType))
  const getFrameActionLabel = (storyboard: ShotImageStoryboard, frameType: string) => {
    if (deps.isPendingFrame(storyboard.id, frameType)) return '生成中'
    return hasFrameByType(storyboard, frameType) ? '重新生成' : '立即生成'
  }
  const getFrameStateText = (storyboard: ShotImageStoryboard, frameType: string) => {
    if (deps.isPendingFrame(storyboard.id, frameType)) return '生成中'
    return hasFrameByType(storyboard, frameType) ? '已出图' : '待出图'
  }
  const getFrameStateClass = (storyboard: ShotImageStoryboard, frameType: string) => {
    const text = getFrameStateText(storyboard, frameType)
    if (text === '生成中') return 'is-pending'
    if (text === '待出图') return 'is-empty'
    return 'is-ready'
  }

  watch(
    () => [selectedShot.value?.id || 0, selectedShot.value?.image_prompt || selectedShot.value?.imagePrompt || ''],
    () => {
      const shot = selectedShot.value
      promptDraft.value = shot ? shot.image_prompt || shot.imagePrompt || deriveShotPrompt(shot) : ''
    },
    { immediate: true },
  )
  watch(
    () => [selectedShot.value?.id || 0, selectedShot.value?.negative_prompt || selectedShot.value?.negativePrompt || ''],
    () => {
      negativePromptDraft.value = selectedShot.value?.negative_prompt || selectedShot.value?.negativePrompt || ''
    },
    { immediate: true },
  )

  function savePromptDraft(nextValue = promptDraft.value) {
    if (!selectedShot.value) return
    const value = String(nextValue ?? '').trim()
    promptDraft.value = value
    deps.emit('update-shot-field', { sb: selectedShot.value, field: 'image_prompt', value })
  }
  function saveNegativePromptDraft(nextValue = negativePromptDraft.value) {
    if (!selectedShot.value) return
    const value = String(nextValue ?? '').trim()
    negativePromptDraft.value = value
    deps.emit('update-shot-field', { sb: selectedShot.value, field: 'negative_prompt', value })
  }
  function applyDerivedPrompt() {
    if (!selectedShot.value) return
    const nextPrompt = deriveShotPrompt(selectedShot.value)
    promptDraft.value = nextPrompt
    savePromptDraft(nextPrompt)
  }
  function saveReferenceImages(nextImages: string[]) {
    if (!selectedShot.value) return
    deps.emit('update-shot-field', {
      sb: selectedShot.value,
      field: 'reference_images',
      value: JSON.stringify(nextImages.slice(0, 6)),
    })
  }

  const selectedManualReferenceImages = computed(() => (
    selectedShot.value && deps.getManualReferenceImages ? deps.getManualReferenceImages(selectedShot.value) : []
  ))
  const selectedReferenceImages = computed(() => (
    selectedShot.value ? deps.getReferenceImages(selectedShot.value) : []
  ))
  const selectedReferenceDisplayImages = computed(() => {
    if (!selectedShot.value) return []
    const first = getFrameImage(selectedShot.value, 'first_frame')
    const last = getFrameImage(selectedShot.value, 'last_frame')
    return selectedReferenceImages.value.filter(src => src !== first && src !== last)
  })
  const filteredReferenceOptions = computed(() => (
    deps.referenceOptions().filter(option => option.type === referencePickerTab.value && option.src)
  ))
  const addReferenceImage = (src: string) => {
    if (!src) return
    const next = [...selectedManualReferenceImages.value]
    if (!next.includes(src)) next.unshift(src)
    saveReferenceImages(next)
  }
  const removeReferenceImage = (src: string) => {
    saveReferenceImages(selectedManualReferenceImages.value.filter(item => item !== src))
  }

  const frameModeLabel = computed(() => deps.frameMode() === 'first_last' ? '首尾帧' : '首帧模式')
  const shotGenerationProgress = computed(() => {
    const storyboards = deps.storyboards()
    return storyboards.length ? Math.round((deps.generatedCount() / storyboards.length) * 100) : 0
  })
  const selectedResultCards = computed(() => {
    const frameTypes = deps.frameMode() === 'first_last' ? ['first_frame', 'last_frame'] : ['first_frame']
    const shot = selectedShot.value
    if (!shot) return []
    return frameTypes.map((frameType) => {
      const slotLabel = frameType === 'last_frame' ? '尾帧' : '首帧'
      const imageSrc = getFrameImage(shot, frameType)
      const pending = deps.isPendingFrame(shot.id, frameType)
      const stateText = getFrameStateText(shot, frameType)
      return {
        key: `${shot.id}-${frameType}`,
        sb: shot,
        frameType,
        imageSrc,
        pending,
        slotLabel,
        viewerTitle: `镜头 #${selectedShotIndexLabel.value} ${slotLabel}`,
        actionLabel: getFrameActionLabel(shot, frameType),
        stateText,
        stateClass: getFrameStateClass(shot, frameType),
        stateNote: pending
          ? `${slotLabel}正在生成中`
          : imageSrc
            ? `${slotLabel}已生成，可查看大图或重新生成`
            : `当前还没有${slotLabel}，可以直接开始生成`,
      }
    })
  })
  const selectedHistoryCards = computed(() => {
    const shot = selectedShot.value
    if (!shot?.id) return []
    return (deps.history()[shot.id] || []).map((item, index) => ({
      key: `${shot.id}-${item.frameType}-${item.src}-${index}`,
      ...item,
      slotLabel: item.frameType === 'last_frame' ? '尾帧' : '首帧',
    }))
  })
  const readyResultCount = computed(() => selectedResultCards.value.filter(card => card.imageSrc).length)
  const selectedShotPendingAny = computed(() => selectedResultCards.value.some(card => card.pending))

  function openFrameViewer(card: { imageSrc: string; viewerTitle: string }) {
    if (card.imageSrc) deps.openImage(deps.resolveAssetUrl(card.imageSrc), card.viewerTitle)
  }
  function generateFrame(card: { sb: ShotImageStoryboard; frameType: string }) {
    savePromptDraft()
    deps.emit('generate-shot-frame', { sb: card.sb, frameType: card.frameType, quantity: generationQuantity.value })
  }
  function generateSingleFrame(frameType: string) {
    if (!selectedShot.value) return
    savePromptDraft()
    deps.emit('generate-shot-frame', { sb: selectedShot.value, frameType, quantity: generationQuantity.value })
  }
  function generateSelectedFrames() {
    if (!selectedShot.value) return
    savePromptDraft()
    deps.emit('generate-shot-frame', { sb: selectedShot.value, frameType: 'first_frame', quantity: generationQuantity.value })
    if (deps.frameMode() === 'first_last') {
      deps.emit('generate-shot-frame', { sb: selectedShot.value, frameType: 'last_frame', quantity: generationQuantity.value })
    }
  }
  function restoreHistoryImage(item: ShotImageHistoryItem) {
    if (!selectedShot.value || !item?.src || !item?.frameType) return
    deps.emit('restore-shot-frame', { sb: selectedShot.value, frameType: item.frameType, src: item.src })
  }

  return {
    frameCardAspectRatio,
    selectedShot,
    generationQuantity,
    referencePickerOpen,
    referencePickerTab,
    selectedShotIndex,
    selectedShotIndexLabel,
    promptDraft,
    negativePromptDraft,
    selectedReferenceDisplayImages,
    filteredReferenceOptions,
    frameModeLabel,
    shotGenerationProgress,
    selectedResultCards,
    selectedHistoryCards,
    readyResultCount,
    selectedShotPendingAny,
    getFrameImage,
    getShotCover,
    getFrameActionLabel,
    getFrameStateText,
    getFrameStateClass,
    savePromptDraft,
    saveNegativePromptDraft,
    applyDerivedPrompt,
    addReferenceImage,
    removeReferenceImage,
    openFrameViewer,
    generateFrame,
    generateSingleFrame,
    generateSelectedFrames,
    restoreHistoryImage,
  }
}
