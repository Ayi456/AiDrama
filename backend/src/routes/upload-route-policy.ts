export function buildUploadResponsePayload(savedPath: string, publicUrl?: string | null) {
  const path = String(savedPath || '').trim().replace(/^\/+/, '')
  const url = String(publicUrl || '').trim() || `/${path}`

  return { url, path }
}

function normalizeUploadSubDir(subDir: string) {
  return String(subDir || '').trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/') || 'uploads'
}

function normalizeUploadExt(originalName: string, fallbackExt = '.bin') {
  const cleanName = String(originalName || '').trim()
  const match = cleanName.match(/(\.[a-zA-Z0-9]{1,10})$/)
  return match ? match[1].toLowerCase() : fallbackExt
}

export function buildUploadedStaticPath(subDir: string, originalName: string, id: string, fallbackExt = '.bin') {
  const normalizedSubDir = normalizeUploadSubDir(subDir)
  const normalizedId = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'upload'
  return `static/${normalizedSubDir}/${normalizedId}${normalizeUploadExt(originalName, fallbackExt)}`
}

export function buildDirectUploadResponsePayload(input: {
  savedPath: string
  publicUrl: string
  uploadUrl: string
  contentType?: string | null
}) {
  return {
    ...buildUploadResponsePayload(input.savedPath, input.publicUrl),
    upload_url: input.uploadUrl,
    method: 'PUT',
    headers: input.contentType ? { 'Content-Type': input.contentType } : {},
  }
}
