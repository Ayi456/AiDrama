import { api, uploadRequest } from './client.ts'
import type {
  AuthLoginPayload,
  AuthRegisterPayload,
  AuthSession,
  AuthSmsCodePayload,
  AuthUser,
  DirectUploadTarget,
  UploadResult,
} from './types.ts'

export const authAPI = {
  login: (data: AuthLoginPayload) => api.post<AuthSession>('/auth/login', data),
  register: (data: AuthRegisterPayload) => api.post<AuthSession>('/auth/register', data),
  session: () => api.get<{ user: AuthUser }>('/auth/session'),
  sendRegisterCode: (phone: string) => api.post<AuthSmsCodePayload>('/auth/sms-code', { phone }),
  logout: () => api.post('/auth/logout', {}),
}

function uploadImageMultipart(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return uploadRequest<UploadResult>('/upload/image', formData)
}

async function requestDirectImageUpload(file: File) {
  return api.post<DirectUploadTarget>('/upload/image/direct', {
    filename: file.name,
    content_type: file.type,
    size: file.size,
  })
}

async function uploadToDirectTarget(file: File, target: DirectUploadTarget) {
  const uploadUrl = target.upload_url || target.uploadUrl
  if (!uploadUrl || !target.url || !target.path) {
    throw new Error('Direct upload target is invalid')
  }

  const response = await fetch(uploadUrl, {
    method: target.method || 'PUT',
    headers: target.headers || {},
    body: file,
  })
  if (response.ok) return

  const text = await response.text().catch(() => '')
  const detail = text ? `: ${text.slice(0, 200)}` : ''
  throw new Error(`COS direct upload failed ${response.status}${detail}`)
}

export const uploadAPI = {
  image: async (file: File) => {
    let target: DirectUploadTarget
    try {
      target = await requestDirectImageUpload(file)
    } catch (error) {
      console.warn('[Upload] Direct image upload is unavailable, falling back to multipart upload.', error)
      return uploadImageMultipart(file)
    }

    await uploadToDirectTarget(file, target)
    return { url: target.url, path: target.path }
  },
  video: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadRequest<UploadResult>('/upload/video', formData)
  },
  audio: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadRequest<UploadResult>('/upload/audio', formData)
  },
}
