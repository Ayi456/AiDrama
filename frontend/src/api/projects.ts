import { api } from './client.ts'
import type {
  ApiList,
  ApiRequestBody,
  CharacterAsset,
  Drama,
  DramaCharacter,
  Episode,
  ImageGenerationStart,
  Scene,
  Storyboard,
} from './types.ts'

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

export const storyboardAPI = {
  create: (data: ApiRequestBody) => api.post<Storyboard>('/storyboards', data),
  update: (id: number, data: ApiRequestBody) => api.put<Storyboard>(`/storyboards/${id}`, data),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  create: (data: ApiRequestBody) => api.post<DramaCharacter>('/characters', data),
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
  create: (data: ApiRequestBody) => api.post<Scene>('/scenes', data),
  update: (id: number, data: ApiRequestBody) => api.put<Scene>(`/scenes/${id}`, data),
  generateImage: (id: number, episodeId: number) => api.post<ImageGenerationStart>(`/scenes/${id}/generate-image`, { episode_id: episodeId }),
}
