import { Hono, type Context } from 'hono'
import { v4 as uuid } from 'uuid'
import { success, badRequest } from '../utils/response.js'
import {
  buildCosObjectUrl,
  createCosPresignedObjectUrl,
  getCosConfig,
  staticAssetToCosObjectKey,
  uploadStaticAssetToCos,
} from '../utils/cos.js'
import { saveUploadedFile } from '../utils/storage.js'
import {
  buildDirectUploadResponsePayload,
  buildUploadedStaticPath,
  buildUploadResponsePayload,
} from './upload-route-policy.js'

const app = new Hono()

async function saveMediaUpload(c: Context, options: {
  kind: 'image' | 'video' | 'audio'
  subDir: string
  mimePrefix: string
}) {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }
  if (file.type && !file.type.startsWith(options.mimePrefix)) {
    return badRequest(c, `${options.kind} file is required`)
  }

  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(buffer, options.subDir, file.name)

  let publicUrl: string | null = null
  try {
    publicUrl = await uploadStaticAssetToCos(path)
  } catch (error) {
    console.warn(`[Upload] Failed to publish ${path} to COS, falling back to local static path`, error)
  }

  return success(c, buildUploadResponsePayload(path, publicUrl))
}

async function createDirectUpload(c: Context, options: {
  kind: 'image' | 'video' | 'audio'
  subDir: string
  mimePrefix: string
  fallbackExt: string
}) {
  let config
  try {
    config = getCosConfig()
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : 'COS config is invalid')
  }
  if (!config) return badRequest(c, 'COS direct upload is not configured')

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const filename = String(body.filename || body.name || `upload${options.fallbackExt}`)
  const contentType = String(body.content_type || body.contentType || '')
  if (contentType && !contentType.startsWith(options.mimePrefix)) {
    return badRequest(c, `${options.kind} file is required`)
  }

  const savedPath = buildUploadedStaticPath(options.subDir, filename, uuid(), options.fallbackExt)
  const objectKey = staticAssetToCosObjectKey(savedPath)
  const uploadUrl = createCosPresignedObjectUrl('PUT', objectKey, config)
  if (!uploadUrl) return badRequest(c, 'Failed to create COS direct upload URL')

  return success(c, buildDirectUploadResponsePayload({
    savedPath,
    publicUrl: buildCosObjectUrl(objectKey, config),
    uploadUrl,
    contentType: contentType || null,
  }))
}

// POST /upload/image
app.post('/image', async (c) => {
  return saveMediaUpload(c, { kind: 'image', subDir: 'uploads', mimePrefix: 'image/' })
})

// POST /upload/image/direct
app.post('/image/direct', async (c) => {
  return createDirectUpload(c, { kind: 'image', subDir: 'uploads', mimePrefix: 'image/', fallbackExt: '.png' })
})

// POST /upload/video
app.post('/video', async (c) => {
  return saveMediaUpload(c, { kind: 'video', subDir: 'videos', mimePrefix: 'video/' })
})

// POST /upload/audio
app.post('/audio', async (c) => {
  return saveMediaUpload(c, { kind: 'audio', subDir: 'audio', mimePrefix: 'audio/' })
})

export default app
