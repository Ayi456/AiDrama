const DEFAULT_IMAGE_SIZE = '1920x1080'
const HIGH_RES_IMAGE_SIZE = '2K'

function isSeedreamModel(model?: string | null) {
  return /seedream/i.test(String(model || ''))
}

export function resolveRequestedImageSize(
  provider: string,
  size?: string | null,
  model?: string | null,
) {
  const requested = String(size || '').trim()
  if (requested) return requested

  if (provider === 'volcengine' || isSeedreamModel(model)) {
    return HIGH_RES_IMAGE_SIZE
  }

  return DEFAULT_IMAGE_SIZE
}
