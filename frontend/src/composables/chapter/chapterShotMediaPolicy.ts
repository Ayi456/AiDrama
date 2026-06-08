import type {
  ChapterCharacter,
  ChapterScene,
  ChapterStoryboard,
  VideoGeneratePayload,
  VideoReferenceOverride,
} from './chapterMediaTypes'

export function getFirstFrame(storyboard: ChapterStoryboard | null | undefined) {
  return storyboard?.first_frame_image || storyboard?.firstFrameImage || null
}

export function getLastFrame(storyboard: ChapterStoryboard | null | undefined) {
  return storyboard?.last_frame_image || storyboard?.lastFrameImage || null
}

export function getStoryboardCover(storyboard: ChapterStoryboard | null | undefined) {
  return storyboard?.composed_image || storyboard?.composedImage || getFirstFrame(storyboard) || getLastFrame(storyboard) || null
}

export function getVideoUrl(storyboard: ChapterStoryboard | null | undefined) {
  return storyboard?.video_url || storyboard?.videoUrl || null
}

export function getComposedVideoUrl(storyboard: ChapterStoryboard | null | undefined) {
  return storyboard?.composed_video_url || storyboard?.composedVideoUrl || null
}

export function hasStoryboardImage(storyboard: ChapterStoryboard | null | undefined) {
  return !!getStoryboardCover(storyboard)
}

export function hasStoryboardVideo(storyboard: ChapterStoryboard | null | undefined) {
  return !!getVideoUrl(storyboard)
}

export function hasComposedVideo(storyboard: ChapterStoryboard | null | undefined) {
  return !!getComposedVideoUrl(storyboard)
}

export function parseStoryboardReferenceImages(storyboard: ChapterStoryboard | null | undefined) {
  const raw = storyboard?.reference_images || storyboard?.referenceImages
  if (!raw) return []
  if (Array.isArray(raw)) return normalizeUrlList(raw)
  try {
    const parsed = JSON.parse(raw)
    return normalizeUrlList(parsed)
  } catch {
    return []
  }
}

export function normalizeUrlList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
  }
  return Array.from(new Set(String(value).split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)))
}

export type MultimodalReferenceOption = {
  label: string
  url: string
  source: 'character' | 'scene'
}

function storyboardBindingIds(
  storyboard: ChapterStoryboard | null | undefined,
  snakeKey: 'character_ids' | 'scene_id',
  camelKey: 'characterIds' | 'sceneId',
) {
  const raw = storyboard?.[snakeKey] ?? storyboard?.[camelKey]
  if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite)
  if (raw == null || String(raw).trim() === '') return []
  return [Number(raw)].filter(Number.isFinite)
}

function addMultimodalReference(
  references: MultimodalReferenceOption[],
  option: MultimodalReferenceOption,
) {
  const url = String(option.url || '').trim()
  if (!url || references.some(item => item.url === url)) return
  references.push({ ...option, url })
}

export function buildMultimodalReferenceOptions(input: {
  storyboard: ChapterStoryboard | null | undefined
  chars: ChapterCharacter[]
  scenes: ChapterScene[]
}): MultimodalReferenceOption[] {
  const references: MultimodalReferenceOption[] = []
  const characterIds = new Set(storyboardBindingIds(input.storyboard, 'character_ids', 'characterIds'))
  const sceneIds = new Set(storyboardBindingIds(input.storyboard, 'scene_id', 'sceneId'))

  input.chars
    .filter(character => characterIds.has(Number(character.id)))
    .forEach((character) => {
      const label = character.name || `角色 ${character.id}`
      addMultimodalReference(references, {
        label,
        url: character.image_url || character.imageUrl || '',
        source: 'character',
      })
    })

  input.scenes
    .filter(scene => sceneIds.has(Number(scene.id)))
    .forEach((scene) => {
      addMultimodalReference(references, {
        label: scene.name || scene.location || `场景 ${scene.id}`,
        url: scene.image_url || scene.imageUrl || '',
        source: 'scene',
      })
    })

  return references.slice(0, 9)
}

export function buildAllMultimodalReferenceOptions(input: {
  chars: ChapterCharacter[]
  scenes: ChapterScene[]
}): MultimodalReferenceOption[] {
  const references: MultimodalReferenceOption[] = []

  input.chars.forEach((character) => {
    const label = character.name || `瑙掕壊 ${character.id}`
    addMultimodalReference(references, {
      label,
      url: character.image_url || character.imageUrl || '',
      source: 'character',
    })
  })

  input.scenes.forEach((scene) => {
    addMultimodalReference(references, {
      label: scene.name || scene.location || `鍦烘櫙 ${scene.id}`,
      url: scene.image_url || scene.imageUrl || '',
      source: 'scene',
    })
  })

  return references
}

function getStoryboardDialogue(storyboard: ChapterStoryboard | null | undefined) {
  return String(
    storyboard?.dialogue ||
    storyboard?.narration ||
    storyboard?.voice_over ||
    storyboard?.voiceOver ||
    '',
  ).trim()
}

function appendDialogueToVideoPrompt(prompt: string, storyboard: ChapterStoryboard | null | undefined) {
  const dialogue = getStoryboardDialogue(storyboard)
  const normalizedPrompt = String(prompt || '').trim()
  if (!dialogue) return normalizedPrompt
  if (normalizedPrompt.includes(dialogue) || normalizedPrompt.includes('对白/旁白')) return normalizedPrompt
  return [normalizedPrompt, `对白/旁白：${dialogue}`].filter(Boolean).join('\n')
}

export function buildShotImagePrompt(input: {
  storyboard: ChapterStoryboard
  frameType: string
  aspectRatio?: string
  characterNames: string[]
  sceneName: string
}) {
  const { storyboard, frameType, aspectRatio, characterNames, sceneName } = input
  const title = storyboard.title || ''
  const description = storyboard.image_prompt || storyboard.imagePrompt || storyboard.description || ''
  const shotType = storyboard.shot_type || storyboard.shotType || ''
  const angle = storyboard.angle || ''
  const movement = storyboard.movement || ''
  const location = storyboard.location || sceneName
  const time = storyboard.time || ''
  const charactersText = characterNames.join('、')
  const action = storyboard.action || ''
  const atmosphere = storyboard.atmosphere || ''
  const frameHint = frameType === 'first_frame'
    ? '生成这个镜头的起始关键帧，突出建立关系和动作开始瞬间。'
    : '生成这个镜头的结束关键帧，突出动作结束、情绪落点或结果状态。'

  return [
    title ? `镜头标题：${title}` : '',
    description ? `画面描述：${description}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action ? `动作：${action}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
    aspectRatio ? `画幅比例：${aspectRatio}` : '',
    frameHint,
  ].filter(Boolean).join('；')
}

export function buildDefaultVideoPrompt(storyboard: ChapterStoryboard | null | undefined) {
  if (!storyboard) return ''
  return appendDialogueToVideoPrompt([
    storyboard.title ? `镜头标题：${storyboard.title}` : '',
    storyboard.description ? `画面描述：${storyboard.description}` : '',
    storyboard.shot_type || storyboard.shotType ? `景别：${storyboard.shot_type || storyboard.shotType}` : '',
    storyboard.movement ? `运镜：${storyboard.movement}` : '',
    storyboard.action ? `动作：${storyboard.action}` : '',
    storyboard.atmosphere ? `氛围：${storyboard.atmosphere}` : '',
    '请生成节奏自然、动作连贯、电影感强的镜头视频。',
  ].filter(Boolean).join('\n'), storyboard)
}

export function getStoryboardStateText(input: {
  storyboard: ChapterStoryboard | null | undefined
  pendingVideo: boolean
}) {
  const { storyboard, pendingVideo } = input
  if (!storyboard) return '待制作'
  if (hasStoryboardVideo(storyboard) || hasComposedVideo(storyboard)) return '已生成视频'
  if (pendingVideo) return '视频生成中'
  if (getFirstFrame(storyboard) || getLastFrame(storyboard)) return '已出帧'
  return '待制作'
}

export function getStoryboardStateClass(stateText: string) {
  if (stateText === '已生成视频') return 'is-ready'
  if (stateText === '视频生成中') return 'is-pending'
  if (stateText === '已出帧') return 'is-warm'
  return 'is-empty'
}

export function getVideoGenerateActionLabel(pendingVideo: boolean) {
  return pendingVideo ? '生成中' : '生成视频'
}

export function getVideoStateText(input: {
  storyboard: ChapterStoryboard | null | undefined
  pendingVideo: boolean
}) {
  const { storyboard, pendingVideo } = input
  if (!storyboard) return '仅文本'
  if (pendingVideo) return '生成中'
  if (hasStoryboardVideo(storyboard)) return '已生成'
  if (hasStoryboardImage(storyboard)) return '待生成'
  return '仅文本'
}

export function getVideoStateClass(stateText: string) {
  if (stateText === '已生成') return 'is-ready'
  if (stateText === '生成中') return 'is-pending'
  if (stateText === '待生成') return 'is-warm'
  return 'is-empty'
}

export function getVideoReferenceSummary(storyboard: ChapterStoryboard | null | undefined) {
  const first = getFirstFrame(storyboard)
  const last = getLastFrame(storyboard)
  const refs = parseStoryboardReferenceImages(storyboard)
  if (first && last) return '首尾帧参考'
  if (first) return '首帧参考'
  if (refs.length) return `${refs.length} 张参考图`
  return '仅提示词生成'
}

export function buildVideoGeneratePayload(input: {
  storyboard: ChapterStoryboard
  dramaId: number
  configId?: number
  override?: VideoReferenceOverride
}): VideoGeneratePayload {
  const { storyboard, dramaId, configId, override = {} } = input
  const first = getFirstFrame(storyboard)
  const last = getLastFrame(storyboard)
  const refs = parseStoryboardReferenceImages(storyboard)
  const overrideMode = String(override.reference_mode || '').trim()
  const overrideImage = String(override.image_url || '').trim()
  const overrideFirst = String(override.first_frame_url || '').trim()
  const overrideLast = String(override.last_frame_url || '').trim()
  const prompt = appendDialogueToVideoPrompt(
    storyboard.video_prompt || storyboard.videoPrompt || buildDefaultVideoPrompt(storyboard),
    storyboard,
  )
  const payload: VideoGeneratePayload = {
    storyboard_id: storyboard.id,
    drama_id: dramaId,
    config_id: configId,
    prompt,
    duration: Number(storyboard.duration || 5),
  }

  if (overrideMode === 'multimodal') {
    const referenceImageUrls = normalizeUrlList([
      overrideFirst,
      overrideImage,
      ...normalizeUrlList(override.reference_image_urls),
    ]).slice(0, 9)
    return {
      ...payload,
      reference_mode: 'multimodal',
      reference_image_urls: referenceImageUrls,
      reference_video_urls: normalizeUrlList(override.reference_video_urls),
      reference_audio_urls: normalizeUrlList(override.reference_audio_urls),
    }
  }

  const captureFirst = overrideFirst || overrideImage
  const captureLast = overrideLast || last

  if (overrideMode === 'capture') {
    if (captureFirst && captureLast) {
      return { ...payload, reference_mode: 'first_last', first_frame_url: captureFirst, last_frame_url: captureLast }
    }
    if (captureFirst) {
      return { ...payload, reference_mode: 'single', image_url: captureFirst }
    }
  }

  if (overrideMode === 'single') {
    const imageUrl = overrideImage || overrideFirst || first
    if (imageUrl) {
      return { ...payload, reference_mode: 'single', image_url: imageUrl }
    }
  }

  if (overrideMode === 'first_last') {
    const firstFrame = overrideFirst || first
    const lastFrame = overrideLast || last
    if (firstFrame && lastFrame) {
      return { ...payload, reference_mode: 'first_last', first_frame_url: firstFrame, last_frame_url: lastFrame }
    }
    if (firstFrame) {
      return { ...payload, reference_mode: 'single', image_url: firstFrame }
    }
  }

  if (first && last) {
    return { ...payload, reference_mode: 'first_last', first_frame_url: first, last_frame_url: last }
  }
  if (refs.length) {
    return { ...payload, reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean) }
  }
  if (first) {
    return { ...payload, reference_mode: 'single', image_url: first }
  }
  return payload
}
