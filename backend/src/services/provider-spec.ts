export type MediaInputType = 'image' | 'video' | 'audio' | 'text'
export type MediaInputRole =
  | 'subject'
  | 'reference'
  | 'first_frame'
  | 'last_frame'
  | 'reference_video'
  | 'reference_audio'

export interface MediaInput {
  type: MediaInputType
  role: MediaInputRole
  url?: string
  text?: string
  metadata?: Record<string, unknown>
}

export interface ImageJobSpec {
  prompt: string
  mode: 'text_to_image' | 'image_to_image' | 'multi_ref_image' | 'sequential_set'
  inputs: MediaInput[]
  output: {
    count?: number
    size?: string
    width?: number
    height?: number
    format?: 'jpeg' | 'png'
  }
  control: {
    seed?: number
    watermark?: boolean
    stream?: boolean
  }
  providerOptions: Record<string, Record<string, unknown>>
  context: {
    frameType?: string
  }
}

export interface VideoJobSpec {
  prompt: string
  mode: 'text_to_video' | 'image_to_video' | 'first_last_video' | 'multi_modal_video'
  inputs: MediaInput[]
  output: {
    duration?: number
    ratio?: string
    resolution?: string
  }
  control: {
    seed?: number
    generateAudio?: boolean
    returnLastFrame?: boolean
    watermark?: boolean
  }
  providerOptions: Record<string, Record<string, unknown>>
}

interface LegacyImageRequest {
  prompt?: string | null
  size?: string | null
  frameType?: string | null
  referenceImages?: string[] | string | null
}

interface LegacyVideoRequest {
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string[] | string | null
  duration?: number | null
  aspectRatio?: string | null
}

export interface ProviderDefaults {
  control?: Record<string, unknown>
  providerOptions?: Record<string, Record<string, unknown>>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord<T extends Record<string, unknown>>(value: unknown): T | undefined {
  return isObject(value) ? (value as T) : undefined
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    if (isObject(value) && isObject(next[key])) {
      next[key] = deepMerge(next[key] as Record<string, unknown>, value)
      continue
    }
    next[key] = value
  }

  return next as T
}

export function mergeProviderDefaults<T extends Record<string, unknown>>(defaults: T, overrides?: Record<string, unknown> | null): T {
  if (!overrides) return { ...defaults }
  return deepMerge({ ...defaults }, overrides)
}

function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean)
  } catch {}
  return [String(value).trim()].filter(Boolean)
}

function parseSize(size?: string | null) {
  const raw = String(size || '').trim()
  if (!raw) return { size: undefined, width: undefined, height: undefined }

  const match = raw.match(/^(\d{2,5})x(\d{2,5})$/i)
  if (!match) {
    return { size: raw, width: undefined, height: undefined }
  }

  return {
    size: raw,
    width: Number(match[1]),
    height: Number(match[2]),
  }
}

function toImageInputs(urls: string[]): MediaInput[] {
  return urls.map((url) => ({ type: 'image', role: 'reference', url }))
}

export function buildImageJobSpecFromLegacyRequest(
  legacy: LegacyImageRequest,
  defaults: ProviderDefaults = {},
): ImageJobSpec {
  const merged = mergeProviderDefaults<{
    control: ImageJobSpec['control']
    providerOptions: ImageJobSpec['providerOptions']
  }>(
    {
      control: {},
      providerOptions: {},
    },
    {
      control: asRecord<ImageJobSpec['control']>(defaults.control),
      providerOptions: asRecord<ImageJobSpec['providerOptions']>(defaults.providerOptions),
    },
  )
  const providerOptions = asRecord<ImageJobSpec['providerOptions']>(merged.providerOptions) || {}
  const volcengineOptions = asRecord<Record<string, unknown>>(providerOptions.volcengine) || {}

  const references = parseStringArray(legacy.referenceImages)
  const size = parseSize(legacy.size)
  const mode = references.length > 1
    ? 'multi_ref_image'
    : references.length === 1
      ? 'image_to_image'
      : 'text_to_image'

  return {
    prompt: String(legacy.prompt || ''),
    mode,
    inputs: toImageInputs(references),
    output: {
      size: size.size,
      width: size.width,
      height: size.height,
      count: 1,
      format: typeof volcengineOptions.output_format === 'string'
        ? (volcengineOptions.output_format as 'jpeg' | 'png')
        : undefined,
    },
    control: {
      seed: typeof merged.control.seed === 'number' ? merged.control.seed : undefined,
      watermark: typeof merged.control.watermark === 'boolean' ? merged.control.watermark : undefined,
      stream: typeof merged.control.stream === 'boolean' ? merged.control.stream : undefined,
    },
    providerOptions,
    context: {
      frameType: legacy.frameType || undefined,
    },
  }
}

export function buildVideoJobSpecFromLegacyRequest(
  legacy: LegacyVideoRequest,
  defaults: ProviderDefaults = {},
): VideoJobSpec {
  const merged = mergeProviderDefaults<{
    control: VideoJobSpec['control']
    providerOptions: VideoJobSpec['providerOptions']
  }>(
    {
      control: {},
      providerOptions: {},
    },
    {
      control: asRecord<VideoJobSpec['control']>(defaults.control),
      providerOptions: asRecord<VideoJobSpec['providerOptions']>(defaults.providerOptions),
    },
  )
  const providerOptions = asRecord<VideoJobSpec['providerOptions']>(merged.providerOptions) || {}
  const volcengineOptions = asRecord<Record<string, unknown>>(providerOptions.volcengine) || {}

  const referenceMode = String(legacy.referenceMode || '').trim()
  const multipleRefs = parseStringArray(legacy.referenceImageUrls)
  const inputs: MediaInput[] = []
  let mode: VideoJobSpec['mode'] = 'text_to_video'

  if (referenceMode === 'first_last' || (legacy.firstFrameUrl && legacy.lastFrameUrl)) {
    if (legacy.firstFrameUrl) inputs.push({ type: 'image', role: 'first_frame', url: legacy.firstFrameUrl })
    if (legacy.lastFrameUrl) inputs.push({ type: 'image', role: 'last_frame', url: legacy.lastFrameUrl })
    mode = 'first_last_video'
  } else if (referenceMode === 'single' || legacy.imageUrl) {
    if (legacy.imageUrl) inputs.push({ type: 'image', role: 'first_frame', url: legacy.imageUrl })
    mode = 'image_to_video'
  } else if (referenceMode === 'multiple' || multipleRefs.length) {
    inputs.push(...multipleRefs.map((url) => ({ type: 'image' as const, role: 'reference' as const, url })))
    mode = 'multi_modal_video'
  }

  return {
    prompt: String(legacy.prompt || ''),
    mode,
    inputs,
    output: {
      duration: legacy.duration == null ? undefined : Number(legacy.duration),
      ratio: legacy.aspectRatio || undefined,
      resolution: typeof volcengineOptions.resolution === 'string'
        ? String(volcengineOptions.resolution)
        : undefined,
    },
    control: {
      seed: typeof merged.control.seed === 'number' ? merged.control.seed : undefined,
      generateAudio: typeof merged.control.generateAudio === 'boolean' ? merged.control.generateAudio : undefined,
      returnLastFrame: typeof merged.control.returnLastFrame === 'boolean' ? merged.control.returnLastFrame : undefined,
      watermark: typeof merged.control.watermark === 'boolean' ? merged.control.watermark : undefined,
    },
    providerOptions,
  }
}
