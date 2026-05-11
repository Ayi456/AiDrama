export function buildUploadResponsePayload(savedPath: string, publicUrl?: string | null) {
  const path = String(savedPath || '').trim().replace(/^\/+/, '')
  const url = String(publicUrl || '').trim() || `/${path}`

  return { url, path }
}
