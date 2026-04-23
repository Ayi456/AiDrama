export const SHOT_IMAGE_ASPECT_RATIO_OPTIONS = [
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
] as const

export const SHOT_IMAGE_SIZE_PRESET_OPTIONS = [
  { label: '2K', value: '2K', note: '长边 2560，适合大多数镜头' },
  { label: '3K', value: '3K', note: '长边 3072，细节更充分' },
] as const

export type ShotImageAspectRatio = typeof SHOT_IMAGE_ASPECT_RATIO_OPTIONS[number]['value']
export type ShotImageSizePreset = typeof SHOT_IMAGE_SIZE_PRESET_OPTIONS[number]['value']

const SHOT_IMAGE_SIZE_MAP: Record<ShotImageSizePreset, Record<ShotImageAspectRatio, string>> = {
  '2K': {
    '1:1': '2560x2560',
    '4:3': '2560x1920',
    '3:4': '1920x2560',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
  },
  '3K': {
    '1:1': '3072x3072',
    '4:3': '3072x2304',
    '3:4': '2304x3072',
    '16:9': '3072x1728',
    '9:16': '1728x3072',
  },
}

const DEFAULT_ASPECT_RATIO: ShotImageAspectRatio = '16:9'
const DEFAULT_SIZE_PRESET: ShotImageSizePreset = '2K'

export function isShotImageAspectRatio(value: unknown): value is ShotImageAspectRatio {
  return SHOT_IMAGE_ASPECT_RATIO_OPTIONS.some(option => option.value === value)
}

export function isShotImageSizePreset(value: unknown): value is ShotImageSizePreset {
  return SHOT_IMAGE_SIZE_PRESET_OPTIONS.some(option => option.value === value)
}

export function resolveShotImageSize(
  aspectRatio: ShotImageAspectRatio = DEFAULT_ASPECT_RATIO,
  sizePreset: ShotImageSizePreset = DEFAULT_SIZE_PRESET,
) {
  return SHOT_IMAGE_SIZE_MAP[sizePreset]?.[aspectRatio] || SHOT_IMAGE_SIZE_MAP[DEFAULT_SIZE_PRESET][DEFAULT_ASPECT_RATIO]
}
