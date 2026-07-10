import { api } from './client.ts'
import type {
  ApiRequestBody,
  GridGenerateResponse,
  GridPromptResponse,
  ImageGeneration,
  MergeClipSelection,
  VideoGeneration,
} from './types.ts'

export const imageAPI = {
  generate: (data: ApiRequestBody) => api.post<ImageGeneration>('/images', data),
  get: (id: number) => api.get<ImageGeneration>(`/images/${id}`),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get<ImageGeneration[]>(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}

export const gridAPI = {
  prompt: (data: ApiRequestBody) => api.post<GridPromptResponse>('/grid/prompt', data),
  generate: (data: ApiRequestBody) => api.post<GridGenerateResponse>('/grid/generate', data),
  status: (id: number) => api.get<ImageGeneration>(`/grid/status/${id}`),
  split: (data: ApiRequestBody) => api.post('/grid/split', data),
}

export const videoAPI = {
  generate: (data: ApiRequestBody) => api.post<VideoGeneration>('/videos', data),
  get: (id: number) => api.get<VideoGeneration>(`/videos/${id}`),
  retryBilling: (id: number) => api.post<VideoGeneration>(`/videos/${id}/billing/retry`, {}),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get<VideoGeneration[]>(`/videos${query.size ? `?${query.toString()}` : ''}`)
  },
}

export const composeAPI = {
  shot: (id: number) => api.post(`/compose/storyboards/${id}/compose`),
  all: (episodeId: number) => api.post(`/compose/chapters/${episodeId}/compose-all`),
  status: (episodeId: number) => api.get(`/compose/chapters/${episodeId}/compose-status`),
}

export const mergeAPI = {
  merge: (episodeId: number, storyboardIds?: number[], clips?: MergeClipSelection[]) => {
    const body: Record<string, unknown> = {}
    if (Array.isArray(storyboardIds)) body.storyboard_ids = storyboardIds
    if (Array.isArray(clips)) body.clips = clips
    return api.post(`/merge/chapters/${episodeId}/merge`, Object.keys(body).length ? body : undefined)
  },
  status: (episodeId: number) => api.get(`/merge/chapters/${episodeId}/merge`),
}
