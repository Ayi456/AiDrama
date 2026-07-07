import type {
  ChapterCharacter,
  ChapterScene,
  ChapterStoryboard,
  VideoGeneratePayload,
  VideoReferenceBinding,
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
  source: 'character' | 'scene' | 'capture' | 'upload' | string
}

export type DynamicMultimodalReferenceChannel = 'image' | 'video' | 'audio'

export type DynamicMultimodalReferenceMaterial = {
  channel: DynamicMultimodalReferenceChannel
  ordinal: number
  url: string
  label: string
  source: string
  line: string
}

export type DynamicMultimodalReferenceBindingPlan = {
  prompt: string
  imageMaterials: DynamicMultimodalReferenceMaterial[]
  videoMaterials: DynamicMultimodalReferenceMaterial[]
  audioMaterials: DynamicMultimodalReferenceMaterial[]
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
    const label = character.name || `角色 ${character.id}`
    addMultimodalReference(references, {
      label,
      url: character.image_url || character.imageUrl || '',
      source: 'character',
    })
  })

  input.scenes.forEach((scene) => {
    addMultimodalReference(references, {
      label: scene.name || scene.location || `场景 ${scene.id}`,
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

function textValue(value: unknown) {
  return String(value || '').trim()
}

function hasStructuredVideoGuardrails(prompt: string) {
  return prompt.includes('主体与场景') &&
    prompt.includes('起始画面') &&
    prompt.includes('镜头限制') &&
    prompt.includes('结束画面') &&
    prompt.includes('画质与风格') &&
    (prompt.includes('禁止项') || prompt.includes('约束'))
}

function buildShotLimitText(storyboard: ChapterStoryboard) {
  const shotType = textValue(storyboard.shot_type || storyboard.shotType)
  const angle = textValue(storyboard.angle)
  const movement = textValue(storyboard.movement)
  const location = textValue(storyboard.location)
  const time = textValue(storyboard.time)
  const camera = [movement, shotType, angle].filter(Boolean).join('')
  const parts = [
    camera ? `${camera}，镜头语言保持一致，只使用一种运镜` : '',
    location ? `地点始终保持在${location}` : '',
    time ? `时间氛围保持为${time}` : '',
  ].filter(Boolean)
  return parts.join('；') || '保持单一镜头语言和同一空间连续性'
}

function buildRiskDirectives(storyboard: ChapterStoryboard, prompt: string) {
  const source = [
    storyboard.action,
    storyboard.description,
    storyboard.result,
    prompt,
  ].map(textValue).join('\n')
  const directives: string[] = []

  if (/飘出|飘出来|飞出|飞出来/.test(source)) {
    directives.push('小物件按重力从包口滑出或露出，不要悬浮、旋转飞起或违背物理')
  }
  if (/写着|纸条|便利贴|便签/.test(source)) {
    directives.push('纸面文字以简短手写中文痕迹为主，可暗示原文；不要生成大号字幕或乱码文字，重点保留人物读到后的反应')
  }
  return directives
}

function buildForbiddenDirectives(storyboard: ChapterStoryboard, prompt: string) {
  const movement = textValue(storyboard.movement)
  const location = textValue(storyboard.location)
  const result = textValue(storyboard.result)
  return [
    '不要提前完成下一镜头动作',
    '不要新增未写明的人物、地点、道具或剧情结果',
    '不要生成字幕、Logo、水印或 UI',
    '不要生成同款分身或双胞胎效果，同一画面中只保留剧情需要的人物',
    movement.includes('固定') ? '固定镜头内完成动作，不推拉、不摇移、不切镜' : '',
    location ? `不要切到${location}以外的远景或新场景` : '',
    '不要跟拍离开当前地点，除非结束画面明确要求角色已经离开',
    result ? '如果动作描述与结束画面冲突，以结束画面为准' : '',
    ...buildRiskDirectives(storyboard, prompt),
  ].filter(Boolean)
}

function buildSubjectSceneText(storyboard: ChapterStoryboard) {
  const raw = storyboard as Record<string, unknown>
  const character = textValue(raw.character || raw.characterName || raw.characters)
  const location = textValue(storyboard.location)
  const time = textValue(storyboard.time)
  const subject = character || '本镜头明确写到的人物或主体'
  const scene = [location, time].filter(Boolean).join('，') || '本镜头指定场景'
  return `${subject}在${scene}中完成本镜头动作；不要扩展到未写明的人物或地点。`
}

function buildMotionBeatText(input: {
  title: string
  description: string
  action: string
  rawPrompt: string
}) {
  const { title, description, action, rawPrompt } = input
  if (rawPrompt) return `镜头1：按原始镜头意图完成动作，但不得越过结束画面：${rawPrompt}`

  const beats: string[] = []
  if (description) beats.push(`镜头1：${description}`)
  if (action && action !== description) {
    beats.push(`镜头2：按动作描述推进，但停在结束画面前：${action}`)
  }
  if (!beats.length) beats.push(`镜头1：${title || '按本镜头剧情自然推进'}`)
  return beats.join('\n')
}

function buildVideoGenerationPrompt(storyboard: ChapterStoryboard, prompt = '') {
  const rawPrompt = textValue(prompt)
  const title = textValue(storyboard.title)
  const description = textValue(storyboard.description)
  const action = textValue(storyboard.action)
  const result = textValue(storyboard.result)
  const atmosphere = textValue(storyboard.atmosphere)
  const start = description || action || title || '保持本镜头开场状态'
  const motion = rawPrompt
    ? `原始镜头意图：\n${rawPrompt}\n动作节奏：\n${buildMotionBeatText({ title, description, action, rawPrompt })}`
    : `动作节奏：\n${buildMotionBeatText({ title, description, action, rawPrompt })}`
  const forbidden = buildForbiddenDirectives(storyboard, rawPrompt).join('；')

  return [
    title ? `镜头标题：${title}` : '',
    `主体与场景：${buildSubjectSceneText(storyboard)}`,
    `起始画面：${start}`,
    `镜头限制：${buildShotLimitText(storyboard)}`,
    motion,
    result ? `结束画面：${result}` : '结束画面：停在本镜头动作的自然落点，保持可被下一镜头直接承接的状态。',
    atmosphere ? `氛围：${atmosphere}` : '',
    '画质与风格：高清，真实短剧电影感，色彩自然，光线稳定，人物面部和服装保持一致，动作低缓连续。',
    `约束与禁止项：${forbidden}`,
    '请生成节奏自然、动作连贯、电影感强的单镜头视频；不要强行按精确秒数卡动作。',
  ].filter(Boolean).join('\n')
}

function resolveVideoPromptForGeneration(storyboard: ChapterStoryboard) {
  const prompt = textValue(storyboard.video_prompt || storyboard.videoPrompt)
  if (prompt && hasStructuredVideoGuardrails(prompt)) return appendDialogueToVideoPrompt(prompt, storyboard)
  return appendDialogueToVideoPrompt(buildVideoGenerationPrompt(storyboard, prompt), storyboard)
}

function normalizeReferenceBindings(value: unknown): VideoReferenceBinding[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      url: textValue(item?.url),
      label: textValue(item?.label),
      source: textValue(item?.source),
    }))
    .filter(item => item.url || item.label || item.source)
}

function referenceBindingForUrl(
  bindings: VideoReferenceBinding[],
  url: string,
  index: number,
) {
  const matched = bindings.find(item => textValue(item.url) === url)
  if (matched) return matched
  const indexed = bindings[index]
  if (indexed && !textValue(indexed.url)) return indexed
  return {}
}

function referenceLabel(binding: VideoReferenceBinding, fallback: string) {
  return textValue(binding.label) || fallback
}

function inferImageBinding(binding: VideoReferenceBinding, url: string, override: VideoReferenceOverride) {
  const captureUrl = textValue(override.first_frame_url)
  if (captureUrl && captureUrl === url) {
    return {
      ...binding,
      url: textValue(binding.url) || url,
      label: textValue(binding.label) || '上一镜头截帧/首图衔接参考',
      source: 'capture',
    }
  }
  return { ...binding, url: textValue(binding.url) || url }
}

function buildReferenceMaterial(input: {
  channel: DynamicMultimodalReferenceChannel
  index: number
  url: string
  binding: VideoReferenceBinding
  fallbackLabel: string
  line: string
}): DynamicMultimodalReferenceMaterial {
  return {
    channel: input.channel,
    ordinal: input.index + 1,
    url: input.url,
    label: referenceLabel(input.binding, input.fallbackLabel),
    source: textValue(input.binding.source),
    line: input.line,
  }
}

function formatImageBindingLine(index: number, binding: VideoReferenceBinding) {
  const source = textValue(binding.source).toLowerCase()
  const ordinal = index + 1

  if (source === 'capture') {
    return `图片${ordinal}定义为上一镜头截帧/首图衔接参考，仅参考上一镜头结束时的人物位置、光线、构图和状态；这张图不是人物图或场景图，不要用它替代后续角色参考或场景参考。`
  }
  if (source === 'character') {
    const label = referenceLabel(binding, `角色参考${ordinal}`)
    return `将图片${ordinal}中的人物定义为${label}，仅参考该人物的面部、发型、服装、体态和配饰；视频全程使用同一角色名，不要生成第二个相似人物。`
  }
  if (source === 'scene') {
    const label = referenceLabel(binding, `场景参考${ordinal}`)
    return `图片${ordinal}定义为${label}，仅参考地点空间、光线、色调、材质和氛围；不要把场景图中的其他人物或非本镜头地点带入画面。`
  }

  const label = referenceLabel(binding, `参考图${ordinal}`)
  return `图片${ordinal}定义为${label}，仅参考画面主体、构图、光线或质感；不要把未写明的人物、地点或剧情带入本镜头。`
}

function formatVideoBindingLine(index: number, binding: VideoReferenceBinding) {
  const ordinal = index + 1
  const label = referenceLabel(binding, `参考视频${ordinal}`)
  return `视频${ordinal}定义为${label}，仅参考动作节奏、镜头运动或物体运动方式；不要改变本镜头人物、地点和结束画面。`
}

function formatAudioBindingLine(index: number, binding: VideoReferenceBinding) {
  const ordinal = index + 1
  const label = referenceLabel(binding, `参考音频${ordinal}`)
  return `音频${ordinal}定义为${label}，仅参考声音情绪、节奏、音色或环境声质感；不要改写本镜头 dialogue 中的台词内容。`
}

export function buildDynamicMultimodalReferenceBindingPlan(input: {
  imageUrls: string[]
  videoUrls: string[]
  audioUrls: string[]
  override: VideoReferenceOverride
}): DynamicMultimodalReferenceBindingPlan {
  const imageUrls = normalizeUrlList(input.imageUrls).slice(0, 9)
  const videoUrls = normalizeUrlList(input.videoUrls)
  const audioUrls = normalizeUrlList(input.audioUrls)
  const { override } = input
  const emptyPlan: DynamicMultimodalReferenceBindingPlan = {
    prompt: '',
    imageMaterials: [],
    videoMaterials: [],
    audioMaterials: [],
  }
  if (!imageUrls.length && !videoUrls.length && !audioUrls.length) return emptyPlan

  const imageBindings = normalizeReferenceBindings(override.reference_image_bindings)
  const videoBindings = normalizeReferenceBindings(override.reference_video_bindings)
  const audioBindings = normalizeReferenceBindings(override.reference_audio_bindings)
  const lines = ['参考素材绑定：']
  const imageMaterials: DynamicMultimodalReferenceMaterial[] = []
  const videoMaterials: DynamicMultimodalReferenceMaterial[] = []
  const audioMaterials: DynamicMultimodalReferenceMaterial[] = []

  imageUrls.forEach((url, index) => {
    const binding = inferImageBinding(referenceBindingForUrl(imageBindings, url, index), url, override)
    const line = formatImageBindingLine(index, binding)
    lines.push(line)
    imageMaterials.push(buildReferenceMaterial({
      channel: 'image',
      index,
      url,
      binding,
      fallbackLabel: `参考图${index + 1}`,
      line,
    }))
  })
  videoUrls.forEach((url, index) => {
    const binding = referenceBindingForUrl(videoBindings, url, index)
    const line = formatVideoBindingLine(index, binding)
    lines.push(line)
    videoMaterials.push(buildReferenceMaterial({
      channel: 'video',
      index,
      url,
      binding,
      fallbackLabel: `参考视频${index + 1}`,
      line,
    }))
  })
  audioUrls.forEach((url, index) => {
    const binding = referenceBindingForUrl(audioBindings, url, index)
    const line = formatAudioBindingLine(index, binding)
    lines.push(line)
    audioMaterials.push(buildReferenceMaterial({
      channel: 'audio',
      index,
      url,
      binding,
      fallbackLabel: `参考音频${index + 1}`,
      line,
    }))
  })
  lines.push('全程保持角色名、地点名与上述素材定义一致；不要让角色图、场景图、动作参考或音频参考互相混用。')

  return {
    prompt: lines.join('\n'),
    imageMaterials,
    videoMaterials,
    audioMaterials,
  }
}

function buildMultimodalReferenceBindingPrompt(input: {
  imageUrls: string[]
  videoUrls: string[]
  audioUrls: string[]
  override: VideoReferenceOverride
}) {
  return buildDynamicMultimodalReferenceBindingPlan(input).prompt
}

function isVideoPromptSectionHeader(line: string) {
  return /^(镜头标题|主体与场景|起始画面|镜头限制|原始镜头意图|动作节奏|结束画面|氛围|画质与风格|约束与禁止项|对白\/旁白)[:：]/.test(line)
}

function isReferenceBindingLine(line: string) {
  return /^(将图片\d+|图片\d+|视频\d+|音频\d+|全程保持|[-*]\s*(将图片\d+|图片\d+|视频\d+|音频\d+))/.test(line)
}

function stripReferenceBindingSection(prompt: string) {
  const lines = prompt.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (/^参考素材绑定[:：]?/.test(trimmed)) {
      skipping = true
      return
    }
    if (skipping) {
      if (!trimmed) {
        skipping = false
        return
      }
      if (isVideoPromptSectionHeader(trimmed) || !isReferenceBindingLine(trimmed)) {
        skipping = false
        kept.push(line)
      }
      return
    }
    kept.push(line)
  })

  return kept.join('\n').trim()
}

function prependMultimodalReferenceBindings(prompt: string, input: {
  imageUrls: string[]
  videoUrls: string[]
  audioUrls: string[]
  override: VideoReferenceOverride
}) {
  const normalizedPrompt = textValue(prompt)
  const bindingPrompt = buildMultimodalReferenceBindingPrompt(input)
  if (!normalizedPrompt) return bindingPrompt
  return [bindingPrompt, stripReferenceBindingSection(normalizedPrompt)].filter(Boolean).join('\n\n')
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
  return appendDialogueToVideoPrompt(buildVideoGenerationPrompt(storyboard), storyboard)
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

export function shouldShowVideoPendingPlaceholder(input: {
  pendingVideo: boolean
  videoUrl?: string | null
}) {
  return input.pendingVideo && !String(input.videoUrl || '').trim()
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

export function getReferenceModeGuidance(mode: string) {
  if (mode === 'capture') {
    return '用于上下镜头衔接：上一镜头截帧会作为当前镜头起始参考，并与当前镜头尾帧组成首尾帧参考。'
  }
  if (mode === 'multimodal') {
    return '多模态适合角色、场景、风格、动作或声音参考；推荐 3-5 个核心素材，优先角色图、场景图，再按需添加动作视频或音频。截帧只是普通参考图，不等同于强首帧。连续性关键镜头优先用截帧/首尾帧。'
  }
  return '优先使用当前镜头首尾帧；有首尾帧时按首尾帧生成，只有首帧时退回单图参考。'
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
  const prompt = resolveVideoPromptForGeneration(storyboard)
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
    const referenceVideoUrls = normalizeUrlList(override.reference_video_urls)
    const referenceAudioUrls = normalizeUrlList(override.reference_audio_urls)
    const promptWithBindings = prependMultimodalReferenceBindings(prompt, {
      imageUrls: referenceImageUrls,
      videoUrls: referenceVideoUrls,
      audioUrls: referenceAudioUrls,
      override,
    })
    return {
      ...payload,
      prompt: promptWithBindings,
      reference_mode: 'multimodal',
      reference_image_urls: referenceImageUrls,
      reference_video_urls: referenceVideoUrls,
      reference_audio_urls: referenceAudioUrls,
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
    return { ...payload, reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter((url): url is string => !!url) }
  }
  if (first) {
    return { ...payload, reference_mode: 'single', image_url: first }
  }
  return payload
}
