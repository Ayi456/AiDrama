import { computed, ref, watch, type ComputedRef } from 'vue'

import {
  buildAllMultimodalReferenceOptions,
  buildMultimodalReferenceOptions,
  getReferenceModeGuidance,
  type MultimodalReferenceOption,
} from './chapterShotMediaPolicy.ts'
import {
  getCaptureSourceVideoUrl,
  getCaptureTailFrameOptions,
  getDefaultCaptureTailFrameUrl,
  getPreviousStoryboard,
} from './chapterVideoCaptureTargets.ts'
import { captureVideoFrameFile } from './chapterVideoFrameCapture.ts'
import type { ChapterCharacter, ChapterScene, ChapterStoryboard } from './chapterMediaTypes.ts'
import { uniqueMediaByUrl, uniqueStrings } from './chapterVideoWorkbenchPolicy.ts'

type ReferenceMode = 'auto' | 'capture' | 'multimodal'
type MediaKind = 'image' | 'video' | 'audio'
type UploadResult = { url: string; path: string }
type ReferenceItem = MultimodalReferenceOption

type UploadClient = {
  image: (file: File) => Promise<UploadResult>
  video: (file: File) => Promise<UploadResult>
  audio: (file: File) => Promise<UploadResult>
}

type Notifications = {
  error: (message: string) => void
  info: (message: string) => void
  success: (message: string) => void
}

export type ChapterVideoReferenceDependencies = {
  selectedShot: ComputedRef<ChapterStoryboard | null>
  selectedShotIndex: ComputedRef<number>
  selectedShotIndexLabel: ComputedRef<string>
  selectedShotKey: ComputedRef<string>
  storyboards: () => ChapterStoryboard[]
  characters: () => ChapterCharacter[]
  scenes: () => ChapterScene[]
  getFirstFrame: (shot: ChapterStoryboard) => string
  getLastFrame: (shot: ChapterStoryboard) => string
  getDefaultReferenceSummary: (shot: ChapterStoryboard) => string
  hasImage: (shot: ChapterStoryboard) => boolean
  upload: UploadClient
  notify: Notifications
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useChapterVideoReferences(deps: ChapterVideoReferenceDependencies) {
  const referenceMode = ref<ReferenceMode>('auto')
  const captureSourceVideoEl = ref<HTMLVideoElement | null>(null)
  const capturedFrameByShot = ref<Record<string, string>>({})
  const capturedFrameSourceLabelByShot = ref<Record<string, string>>({})
  const selectedTailFrameByShot = ref<Record<string, string>>({})
  const isCapturingFrame = ref(false)
  const selectedReferenceImagesByShot = ref<Record<string, ReferenceItem[]>>({})
  const selectedReferenceVideosByShot = ref<Record<string, ReferenceItem[]>>({})
  const selectedReferenceAudiosByShot = ref<Record<string, ReferenceItem[]>>({})
  const uploadingMediaTypes = ref<MediaKind[]>([])
  const imageUploadInput = ref<HTMLInputElement | null>(null)
  const videoUploadInput = ref<HTMLInputElement | null>(null)
  const audioUploadInput = ref<HTMLInputElement | null>(null)

  const firstFrame = computed(() => {
    const shot = deps.selectedShot.value
    return shot ? deps.getFirstFrame(shot) : ''
  })
  const lastFrame = computed(() => {
    const shot = deps.selectedShot.value
    return shot ? deps.getLastFrame(shot) : ''
  })
  const previousShot = computed(() => {
    const shot = deps.selectedShot.value
    return shot ? getPreviousStoryboard(shot, deps.storyboards()) : null
  })
  const captureSourceVideoUrl = computed(() => {
    const shot = deps.selectedShot.value
    return shot ? getCaptureSourceVideoUrl(shot, deps.storyboards()) : ''
  })
  const captureSourceLabel = computed(() => {
    if (!previousShot.value || !captureSourceVideoUrl.value) return ''
    const previousIndexLabel = deps.selectedShotIndex.value > 0
      ? String(deps.selectedShotIndex.value).padStart(2, '0')
      : ''
    const base = previousIndexLabel ? `镜头 #${previousIndexLabel}` : '上一镜头'
    return previousShot.value.title ? `${base} ${previousShot.value.title}` : base
  })
  const tailFrameOptions = computed(() => (
    deps.selectedShot.value ? getCaptureTailFrameOptions(deps.selectedShot.value) : []
  ))
  const capturedFrameUrl = computed(() => capturedFrameByShot.value[deps.selectedShotKey.value] || '')
  const capturedFrameSourceLabel = computed(() => (
    capturedFrameSourceLabelByShot.value[deps.selectedShotKey.value] || ''
  ))
  const selectedTailFrameUrl = computed(() => {
    const shot = deps.selectedShot.value
    if (!shot) return ''
    if (referenceMode.value !== 'capture') return lastFrame.value
    return selectedTailFrameByShot.value[deps.selectedShotKey.value] || getDefaultCaptureTailFrameUrl(shot)
  })
  const selectedTailFrameLabel = computed(() => {
    if (referenceMode.value !== 'capture') return '尾帧'
    return tailFrameOptions.value.find(item => item.url === selectedTailFrameUrl.value)?.label || '尾帧'
  })

  watch(
    () => [deps.selectedShotKey.value, tailFrameOptions.value.map(item => item.url).join('|')],
    () => {
      if (!deps.selectedShot.value) return
      const key = deps.selectedShotKey.value
      const current = selectedTailFrameByShot.value[key] || ''
      const next = tailFrameOptions.value[0]?.url || ''
      if (current && tailFrameOptions.value.some(item => item.url === current)) return
      if (next) {
        selectedTailFrameByShot.value = { ...selectedTailFrameByShot.value, [key]: next }
        return
      }
      if (!current) return
      const nextMap = { ...selectedTailFrameByShot.value }
      delete nextMap[key]
      selectedTailFrameByShot.value = nextMap
    },
    { immediate: true },
  )

  const activeFirstFrame = computed(() => referenceMode.value === 'capture' ? capturedFrameUrl.value : firstFrame.value)
  const activeLastFrame = computed(() => referenceMode.value === 'capture' ? selectedTailFrameUrl.value : lastFrame.value)
  const activeFirstFrameLabel = computed(() => referenceMode.value === 'capture' ? '截帧' : '首帧')
  const activeFirstFrameEmptyText = computed(() => referenceMode.value === 'capture' ? '暂无截帧' : '暂无首帧')
  const activeLastFrameLabel = computed(() => referenceMode.value === 'capture' ? selectedTailFrameLabel.value : '尾帧')
  const activeLastFrameEmptyText = computed(() => referenceMode.value === 'capture' ? '暂无当前镜头图片' : '暂无尾帧')

  const selectedReferenceImages = computed(() => selectedReferenceImagesByShot.value[deps.selectedShotKey.value] || [])
  const selectedReferenceVideos = computed(() => selectedReferenceVideosByShot.value[deps.selectedShotKey.value] || [])
  const selectedReferenceAudios = computed(() => selectedReferenceAudiosByShot.value[deps.selectedShotKey.value] || [])
  const currentMultimodalReferenceOptions = computed(() => buildMultimodalReferenceOptions({
    storyboard: deps.selectedShot.value,
    chars: deps.characters(),
    scenes: deps.scenes(),
  }))
  const allMultimodalReferenceOptions = computed(() => buildAllMultimodalReferenceOptions({
    chars: deps.characters(),
    scenes: deps.scenes(),
  }))
  const characterReferenceOptions = computed(() => allMultimodalReferenceOptions.value.filter(item => item.source === 'character'))
  const sceneReferenceOptions = computed(() => allMultimodalReferenceOptions.value.filter(item => item.source === 'scene'))
  const multimodalImageReferences = computed(() => {
    const references: ReferenceItem[] = [...selectedReferenceImages.value]
    if (capturedFrameUrl.value) {
      references.unshift({
        label: capturedFrameSourceLabel.value || '上一镜头结尾帧',
        url: capturedFrameUrl.value,
        source: 'capture',
      })
    }
    return uniqueMediaByUrl(references).slice(0, 9)
  })
  const multimodalImageUrls = computed(() => multimodalImageReferences.value.map(item => item.url))

  watch(
    () => [deps.selectedShotKey.value, currentMultimodalReferenceOptions.value.map(item => item.url).join('|')],
    () => {
      if (!deps.selectedShot.value) return
      const key = deps.selectedShotKey.value
      if (Object.prototype.hasOwnProperty.call(selectedReferenceImagesByShot.value, key)) return
      if (!currentMultimodalReferenceOptions.value.length) return
      selectedReferenceImagesByShot.value = {
        ...selectedReferenceImagesByShot.value,
        [key]: currentMultimodalReferenceOptions.value,
      }
    },
    { immediate: true },
  )

  const multimodalVideoUrls = computed(() => uniqueStrings(selectedReferenceVideos.value.map(item => item.url)).slice(0, 3))
  const multimodalAudioUrls = computed(() => uniqueStrings(selectedReferenceAudios.value.map(item => item.url)).slice(0, 3))
  const referenceCountLabel = computed(() => {
    if (referenceMode.value === 'multimodal') {
      return `${multimodalImageUrls.value.length} 图 / ${multimodalVideoUrls.value.length} 视频 / ${multimodalAudioUrls.value.length} 音频`
    }
    return `${Number(Boolean(activeFirstFrame.value)) + Number(Boolean(activeLastFrame.value))} 张`
  })
  const referenceModeGuidance = computed(() => getReferenceModeGuidance(referenceMode.value))
  const activeReferenceSummary = computed(() => {
    const shot = deps.selectedShot.value
    if (!shot) return '仅文本生成'
    if (referenceMode.value !== 'capture') return deps.getDefaultReferenceSummary(shot)
    if (!captureSourceVideoUrl.value) return '当前没有上一镜头视频'
    const firstLabel = capturedFrameUrl.value
      ? (capturedFrameSourceLabel.value ? `首帧：${capturedFrameSourceLabel.value}` : '首帧：上一镜头视频')
      : '首帧：待截取'
    const tailLabel = selectedTailFrameUrl.value ? `尾帧：${selectedTailFrameLabel.value}` : '尾帧：待选择'
    return `${firstLabel} / ${tailLabel}`
  })

  function getReferenceSummary(storyboard: ChapterStoryboard | null | undefined) {
    if (!storyboard) return '仅文本生成'
    if (referenceMode.value === 'capture' && deps.selectedShot.value?.id === storyboard.id) {
      return activeReferenceSummary.value
    }
    return deps.getDefaultReferenceSummary(storyboard)
  }

  function hasReferencePreview(storyboard: ChapterStoryboard | null | undefined) {
    if (!storyboard) return false
    if (referenceMode.value === 'capture' && deps.selectedShot.value?.id === storyboard.id) {
      return Boolean(capturedFrameUrl.value || selectedTailFrameUrl.value)
    }
    return deps.hasImage(storyboard)
  }

  function setReferenceMode(mode: ReferenceMode) {
    referenceMode.value = mode
  }

  function selectTailFrame(url: string) {
    if (!deps.selectedShot.value || !url) return
    selectedTailFrameByShot.value = { ...selectedTailFrameByShot.value, [deps.selectedShotKey.value]: url }
  }

  function clearCapturedFrame() {
    if (!deps.selectedShot.value) return
    const key = deps.selectedShotKey.value
    const nextCaptured = { ...capturedFrameByShot.value }
    const nextLabels = { ...capturedFrameSourceLabelByShot.value }
    delete nextCaptured[key]
    delete nextLabels[key]
    capturedFrameByShot.value = nextCaptured
    capturedFrameSourceLabelByShot.value = nextLabels
  }

  const mediaRefFor = (type: MediaKind) => {
    if (type === 'video') return selectedReferenceVideosByShot
    if (type === 'audio') return selectedReferenceAudiosByShot
    return selectedReferenceImagesByShot
  }
  const mediaItemsFor = (type: MediaKind) => {
    if (type === 'video') return selectedReferenceVideos.value
    if (type === 'audio') return selectedReferenceAudios.value
    return selectedReferenceImages.value
  }
  const mediaLimit = (type: MediaKind) => type === 'image' ? 9 : 3
  const mediaCount = (type: MediaKind) => {
    const items = mediaItemsFor(type)
    if (type !== 'image' || referenceMode.value !== 'multimodal' || !capturedFrameUrl.value) return items.length
    return items.some(item => item.url === capturedFrameUrl.value) ? items.length : items.length + 1
  }
  const setReferenceItems = (type: MediaKind, items: ReferenceItem[]) => {
    const target = mediaRefFor(type)
    target.value = {
      ...target.value,
      [deps.selectedShotKey.value]: uniqueMediaByUrl(items).slice(0, mediaLimit(type)),
    }
  }

  function addReference(type: MediaKind, item: ReferenceItem) {
    if (!item?.url) return
    const current = mediaItemsFor(type)
    if (current.some(reference => reference.url === item.url)) return
    if (mediaCount(type) >= mediaLimit(type)) {
      deps.notify.error(`参考${type === 'image' ? '图' : type === 'video' ? '视频' : '音频'}最多 ${mediaLimit(type)} 个`)
      return
    }
    setReferenceItems(type, [...current, item])
  }

  function removeReference(type: MediaKind, url: string) {
    setReferenceItems(type, mediaItemsFor(type).filter(item => item.url !== url))
  }

  function toggleReferenceImage(item: ReferenceItem) {
    if (isReferenceSelected('image', item.url)) removeReference('image', item.url)
    else addReference('image', item)
  }

  function isReferenceSelected(type: MediaKind, url: string) {
    return mediaItemsFor(type).some(item => item.url === url)
  }

  function isUploadingMedia(type: MediaKind) {
    return uploadingMediaTypes.value.includes(type)
  }

  async function captureCurrentFrame() {
    const video = captureSourceVideoEl.value
    if (!video || !deps.selectedShot.value || !captureSourceVideoUrl.value) {
      deps.notify.error('当前没有上一镜头视频可截取')
      return
    }
    if (referenceMode.value === 'multimodal' && !capturedFrameUrl.value && mediaCount('image') >= mediaLimit('image')) {
      deps.notify.error('参考图已达到上限，请先移除一张图片再截帧')
      return
    }
    isCapturingFrame.value = true
    try {
      const file = await captureVideoFrameFile(video, { filenamePrefix: `shot-${deps.selectedShotIndexLabel.value}-prev` })
      const uploaded = await deps.upload.image(file)
      const nextCaptured = uploaded?.url || uploaded?.path || ''
      if (!nextCaptured) throw new Error('截帧上传失败')
      const key = deps.selectedShotKey.value
      capturedFrameByShot.value = { ...capturedFrameByShot.value, [key]: nextCaptured }
      capturedFrameSourceLabelByShot.value = {
        ...capturedFrameSourceLabelByShot.value,
        [key]: captureSourceLabel.value || '上一镜头视频',
      }
      if (referenceMode.value !== 'multimodal') referenceMode.value = 'capture'
      deps.notify.success('已截取上一镜头帧')
    } catch (error) {
      deps.notify.error(errorMessage(error, '截帧失败'))
    } finally {
      isCapturingFrame.value = false
    }
  }

  async function uploadReferenceFiles(type: MediaKind, event: Event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null
    const files = Array.from(input?.files || [])
    if (input) input.value = ''
    if (!files.length) return
    const remaining = mediaLimit(type) - mediaCount(type)
    if (remaining <= 0) {
      deps.notify.error(`参考${type === 'image' ? '图' : type === 'video' ? '视频' : '音频'}已达到上限`)
      return
    }
    const selectedFiles = files.slice(0, remaining)
    if (files.length > remaining) deps.notify.info(`只添加前 ${remaining} 个文件`)
    uploadingMediaTypes.value = uniqueStrings([...uploadingMediaTypes.value, type]) as MediaKind[]
    try {
      for (const file of selectedFiles) {
        if (type === 'image' && !file.type.startsWith('image/')) throw new Error('请选择图片文件')
        if (type === 'video' && !file.type.startsWith('video/')) throw new Error('请选择视频文件')
        if (type === 'audio' && !file.type.startsWith('audio/')) throw new Error('请选择音频文件')
        const uploaded = await deps.upload[type](file)
        addReference(type, { label: file.name, url: uploaded.url || `/${uploaded.path}`, source: 'upload' })
      }
      deps.notify.success('参考素材已添加')
    } catch (error) {
      deps.notify.error(errorMessage(error, '上传参考素材失败'))
    } finally {
      uploadingMediaTypes.value = uploadingMediaTypes.value.filter(item => item !== type)
    }
  }

  return {
    referenceMode,
    captureSourceVideoEl,
    isCapturingFrame,
    imageUploadInput,
    videoUploadInput,
    audioUploadInput,
    captureSourceVideoUrl,
    captureSourceLabel,
    tailFrameOptions,
    capturedFrameUrl,
    capturedFrameSourceLabel,
    selectedTailFrameUrl,
    activeFirstFrame,
    activeLastFrame,
    activeFirstFrameLabel,
    activeFirstFrameEmptyText,
    activeLastFrameLabel,
    activeLastFrameEmptyText,
    selectedReferenceImages,
    selectedReferenceVideos,
    selectedReferenceAudios,
    characterReferenceOptions,
    sceneReferenceOptions,
    multimodalImageReferences,
    multimodalImageUrls,
    multimodalVideoUrls,
    multimodalAudioUrls,
    referenceCountLabel,
    referenceModeGuidance,
    activeReferenceSummary,
    getReferenceSummary,
    hasReferencePreview,
    setReferenceMode,
    selectTailFrame,
    clearCapturedFrame,
    captureCurrentFrame,
    removeReference,
    toggleReferenceImage,
    isReferenceSelected,
    isUploadingMedia,
    uploadReferenceFiles,
  }
}
