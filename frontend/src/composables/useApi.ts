const BASE = '/api/v1'

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
type ApiRequestBody = Record<string, unknown> | unknown[] | string | number | boolean | null
type ApiEnvelope<T> = {
  code?: number
  data?: T
  message?: string
}

export type ApiEntity = Record<string, unknown> & { id?: number }
export type ApiList<T> = { items: T[] }
export type UploadResult = { url: string; path: string }
type DirectUploadTarget = UploadResult & {
  upload_url?: string
  uploadUrl?: string
  method?: string
  headers?: Record<string, string>
}
export type Drama = ApiEntity & { title?: string; characters?: DramaCharacter[]; scenes?: Scene[] }
export type Episode = ApiEntity & { drama_id?: number; dramaId?: number; title?: string }
export type CharacterAsset = ApiEntity & {
  name?: string
  gender?: string
  role_preset?: string
  image_url?: string
  local_path?: string
  description?: string
  appearance?: string
  tags?: string[]
  is_default?: boolean
  is_active?: boolean
}
export type DramaCharacter = ApiEntity & {
  name?: string
  image_url?: string
  imageUrl?: string
  image_prompt?: string | null
  imagePrompt?: string | null
  character_asset_id?: number | null
  characterAssetId?: number | null
  character_asset?: CharacterAsset | null
  characterAsset?: CharacterAsset | null
  character_asset_image_url?: string | null
  characterAssetImageUrl?: string | null
}
export type Scene = ApiEntity & { location?: string; time?: string; image_url?: string; imageUrl?: string; reference_image?: string | null; referenceImage?: string | null }
export type Storyboard = ApiEntity & {
  storyboard_number?: number
  storyboardNumber?: number
  first_frame_image?: string
  firstFrameImage?: string
  last_frame_image?: string
  lastFrameImage?: string
  video_url?: string
  videoUrl?: string
}
export type AiConfig = ApiEntity & {
  service_type?: string
  provider?: string
  name?: string
  base_url?: string
  model?: unknown
  settings?: Record<string, unknown>
  priority?: number
  is_active?: boolean
  has_api_key?: boolean
}
export type AgentConfig = ApiEntity & { type?: string; name?: string }
export type SkillSummary = { id: string; name: string; description: string }
export type GridLayout = { rows: number; cols: number }
export type GridPromptCell = Record<string, unknown> & {
  shot_number?: number
  frame_type?: string
  prompt?: string
}
export type GridPromptResponse = {
  grid_prompt: string
  cell_prompts: GridPromptCell[]
  source?: string
  grid?: GridLayout
}
export type GridGenerateResponse = {
  image_generation_id: number
  grid: GridLayout
  mode?: string
  storyboard_ids?: number[]
  prompt?: string
  reference_images?: string[]
}
export type GenerationStatus = ApiEntity & {
  status?: string
  error_msg?: string
  errorMsg?: string
}
export type ImageGeneration = GenerationStatus & {
  image_generation_id?: number
  imageGenerationId?: number
  local_path?: string
  localPath?: string
  image_url?: string
  imageUrl?: string
  minio_url?: string
  minioUrl?: string
}
export type VideoGeneration = GenerationStatus & {
  video_generation_id?: number
  videoGenerationId?: number
  local_path?: string
  localPath?: string
  video_url?: string
  videoUrl?: string
  minio_url?: string
  minioUrl?: string
  provider?: string
  model?: string
  prompt?: string
  created_at?: string
  createdAt?: string
}
export type ImageGenerationStart = {
  image_generation_id: number
  imageGenerationId?: number
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function req<T = ApiEntity>(method: ApiMethod, path: string, body?: ApiRequestBody): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    const json = await resp.json() as ApiEnvelope<T>
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(json.message || `${resp.status}`)
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return (json.data ?? json) as T
  } catch (err: unknown) {
    const message = getErrorMessage(err)
    if (!message.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', message)
    }
    throw err
  }
}

async function uploadReq<T = ApiEntity>(path: string, formData: FormData): Promise<T> {
  const start = performance.now()
  console.log(`%c[API] %cPOST %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', '[multipart]')

  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      body: formData,
    })
    const json = await resp.json() as ApiEnvelope<T>
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %cPOST ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(json.message || `${resp.status}`)
    }

    console.log(`%c[API] %cPOST ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return (json.data ?? json) as T
  } catch (err: unknown) {
    const message = getErrorMessage(err)
    if (!message.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %cPOST ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', message)
    }
    throw err
  }
}

export const api = {
  get: <T = ApiEntity>(p: string) => req<T>('GET', p),
  post: <T = ApiEntity>(p: string, b?: ApiRequestBody) => req<T>('POST', p, b),
  put: <T = ApiEntity>(p: string, b?: ApiRequestBody) => req<T>('PUT', p, b),
  del: <T = ApiEntity>(p: string) => req<T>('DELETE', p),
}

function uploadImageMultipart(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return uploadReq<UploadResult>('/upload/image', formData)
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

  const resp = await fetch(uploadUrl, {
    method: target.method || 'PUT',
    headers: target.headers || {},
    body: file,
  })
  if (resp.ok) return

  const text = await resp.text().catch(() => '')
  const detail = text ? `: ${text.slice(0, 200)}` : ''
  throw new Error(`COS direct upload failed ${resp.status}${detail}`)
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
    return uploadReq<UploadResult>('/upload/video', formData)
  },
  audio: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadReq<UploadResult>('/upload/audio', formData)
  },
}

export const dramaAPI = {
  list: () => api.get<ApiList<Drama>>('/dramas'),
  get: (id: number) => api.get<Drama>(`/dramas/${id}`),
  create: (data: ApiRequestBody) => api.post<Drama>('/dramas', data),
  update: (id: number, data: ApiRequestBody) => api.put<Drama>(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

export const chapterAPI = {
  create: (data: ApiRequestBody) => api.post<Episode>('/chapters', data),
  update: (id: number, data: ApiRequestBody) => api.put<Episode>(`/chapters/${id}`, data),
  characters: (id: number) => api.get<DramaCharacter[]>(`/chapters/${id}/characters`),
  scenes: (id: number) => api.get<Scene[]>(`/chapters/${id}/scenes`),
  storyboards: (id: number) => api.get<Storyboard[]>(`/chapters/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/chapters/${id}/pipeline-status`),
}

export const episodeAPI = chapterAPI

export const storyboardAPI = {
  create: (data: ApiRequestBody) => api.post<Storyboard>('/storyboards', data),
  update: (id: number, data: ApiRequestBody) => api.put<Storyboard>(`/storyboards/${id}`, data),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  update: (id: number, data: ApiRequestBody) => api.put<DramaCharacter>(`/characters/${id}`, data),
  bindAsset: (id: number, assetId: number) => api.post(`/characters/${id}/bind-asset`, { character_asset_id: assetId }),
  unbindAsset: (id: number) => api.del(`/characters/${id}/bind-asset`),
  generateImage: (id: number, episodeId: number) => api.post<ImageGenerationStart>(`/characters/${id}/generate-image`, { episode_id: episodeId }),
  batchImages: (ids: number[], episodeId: number) => api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId }),
}

export const characterAssetAPI = {
  list: () => api.get<CharacterAsset[]>('/character-assets'),
  create: (data: ApiRequestBody) => api.post<CharacterAsset>('/character-assets', data),
  update: (id: number, data: ApiRequestBody) => api.put<CharacterAsset>(`/character-assets/${id}`, data),
  setDefault: (id: number) => api.post<CharacterAsset>(`/character-assets/${id}/default`),
  del: (id: number) => api.del(`/character-assets/${id}`),
}

export const sceneAPI = {
  update: (id: number, data: ApiRequestBody) => api.put<Scene>(`/scenes/${id}`, data),
  generateImage: (id: number, episodeId: number) => api.post<ImageGenerationStart>(`/scenes/${id}/generate-image`, { episode_id: episodeId }),
}

export const imageAPI = {
  generate: (d: ApiRequestBody) => api.post<ImageGeneration>('/images', d),
  get: (id: number) => api.get<ImageGeneration>(`/images/${id}`),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get<ImageGeneration[]>(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const gridAPI = {
  prompt: (d: ApiRequestBody) => api.post<GridPromptResponse>('/grid/prompt', d),
  generate: (d: ApiRequestBody) => api.post<GridGenerateResponse>('/grid/generate', d),
  status: (id: number) => api.get<ImageGeneration>(`/grid/status/${id}`),
  split: (d: ApiRequestBody) => api.post('/grid/split', d),
}
export const videoAPI = {
  generate: (d: ApiRequestBody) => api.post<VideoGeneration>('/videos', d),
  get: (id: number) => api.get<VideoGeneration>(`/videos/${id}`),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get<VideoGeneration[]>(`/videos${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const composeAPI = {
  shot: (id: number) => api.post(`/compose/storyboards/${id}/compose`),
  all: (epId: number) => api.post(`/compose/chapters/${epId}/compose-all`),
  status: (epId: number) => api.get(`/compose/chapters/${epId}/compose-status`),
}
export const mergeAPI = {
  merge: (epId: number, storyboardIds?: number[]) => api.post(
    `/merge/chapters/${epId}/merge`,
    Array.isArray(storyboardIds) ? { storyboard_ids: storyboardIds } : undefined,
  ),
  status: (epId: number) => api.get(`/merge/chapters/${epId}/merge`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get<AiConfig[]>(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: ApiRequestBody) => api.post<AiConfig>('/ai-configs', d),
  update: (id: number, d: ApiRequestBody) => api.put<AiConfig>(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: ApiRequestBody) => api.post<ApiEntity>('/ai-configs/test', d),
}

export const agentConfigAPI = {
  list: () => api.get<AgentConfig[]>('/agent-configs'),
  get: (id: number) => api.get<AgentConfig>(`/agent-configs/${id}`),
  create: (d: ApiRequestBody) => api.post<AgentConfig>('/agent-configs', d),
  update: (id: number, d: ApiRequestBody) => api.put<AgentConfig>(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get<SkillSummary[]>('/skills'),
  get: (id: string) => api.get<string>(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}
