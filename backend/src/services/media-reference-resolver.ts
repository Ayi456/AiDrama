type ImageCompressionOptions = {
  maxWidth: number
  maxHeight: number
  quality: number
}

type ReferenceWarningPayload = {
  path: string
  error: string
}

type MediaReferenceResolverDeps = {
  readImageAsCompressedDataUrl?: (localPath: string, options: ImageCompressionOptions) => Promise<string>
  uploadStaticAssetToCos?: (localPath: string) => Promise<string | null>
  warn?: (event: string, payload: ReferenceWarningPayload) => void
}

type ResolveImageReferenceOptions = Partial<ImageCompressionOptions>

const defaultImageCompressionOptions: ImageCompressionOptions = {
  maxWidth: 768,
  maxHeight: 768,
  quality: 68,
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function localStaticPath(value: string) {
  if (value.startsWith('/static/')) return value.slice(1)
  if (value.startsWith('static/')) return value
  return null
}

export function normalizeStringList(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
  }

  return Array.from(
    new Set(
      String(value)
        .split(/\r?\n|,/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )
}

export function parseJsonArrayStringList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? normalizeStringList(parsed) : []
  } catch {
    return []
  }
}

export function parseStoredStringList(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return normalizeStringList(value)

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return normalizeStringList(parsed)
    if (typeof parsed === 'string') return normalizeStringList(parsed)
  } catch {
    return normalizeStringList(value)
  }

  return []
}

export function stringifyStringList(value: string[] | string | null | undefined) {
  const items = normalizeStringList(value)
  return items.length ? JSON.stringify(items) : null
}

export async function resolveImageReference(
  value: string | null | undefined,
  deps: MediaReferenceResolverDeps,
  options: ResolveImageReferenceOptions = {},
): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw

  const localPath = localStaticPath(raw)
  if (!localPath) return raw
  if (!deps.readImageAsCompressedDataUrl) return raw

  try {
    return await deps.readImageAsCompressedDataUrl(localPath, {
      ...defaultImageCompressionOptions,
      ...options,
    })
  } catch (error) {
    deps.warn?.('reference-read-failed', { path: localPath, error: normalizeError(error) })
    return null
  }
}

async function resolveImageReferenceItems(
  items: string[],
  deps: MediaReferenceResolverDeps,
  options: ResolveImageReferenceOptions & { limit?: number } = {},
) {
  const normalized = await Promise.all(
    items.map(item => resolveImageReference(item, deps, options)),
  )
  const resolved = normalized.filter((item): item is string => Boolean(item))
  return options.limit ? resolved.slice(0, options.limit) : resolved
}

export function resolveImageReferenceArray(
  raw: string | null | undefined,
  deps: MediaReferenceResolverDeps,
  options: ResolveImageReferenceOptions & { limit?: number } = {},
) {
  return resolveImageReferenceItems(parseJsonArrayStringList(raw), deps, {
    limit: 6,
    ...options,
  })
}

export function resolveStoredImageReferences(
  raw: string[] | string | null | undefined,
  deps: MediaReferenceResolverDeps,
  options: ResolveImageReferenceOptions & { limit?: number } = {},
) {
  return resolveImageReferenceItems(parseStoredStringList(raw), deps, options)
}

export async function resolveVideoOrAudioReference(
  value: string | null | undefined,
  deps: MediaReferenceResolverDeps,
): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('data:')) return raw

  const localPath = localStaticPath(raw)
  if (!localPath) return raw
  if (!deps.uploadStaticAssetToCos) return raw

  try {
    return await deps.uploadStaticAssetToCos(localPath) || localPath
  } catch (error) {
    deps.warn?.('reference-media-upload-failed', { path: localPath, error: normalizeError(error) })
    return null
  }
}

export async function resolveStoredVideoOrAudioReferences(
  raw: string[] | string | null | undefined,
  deps: MediaReferenceResolverDeps,
) {
  const normalized = await Promise.all(
    parseStoredStringList(raw).map(item => resolveVideoOrAudioReference(item, deps)),
  )
  return normalized.filter((item): item is string => Boolean(item))
}
