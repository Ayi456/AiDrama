import { Hono, type Context } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { uploadStaticAssetToCos } from '../utils/cos.js'
import { saveUploadedFile } from '../utils/storage.js'
import { buildUploadResponsePayload } from './upload-route-policy.js'

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

// POST /upload/image
app.post('/image', async (c) => {
  return saveMediaUpload(c, { kind: 'image', subDir: 'uploads', mimePrefix: 'image/' })
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
