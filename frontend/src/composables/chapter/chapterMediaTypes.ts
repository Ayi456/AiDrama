import type { DramaCharacter, Scene, Storyboard } from '@/composables/useApi'

export type ChapterCharacter = DramaCharacter & {
  role?: string
  image_url?: string
  imageUrl?: string
  local_path?: string
  localPath?: string
}

export type ChapterScene = Scene & {
  name?: string
  image_url?: string
  imageUrl?: string
  local_path?: string
  localPath?: string
  status?: string
  reference_image?: string | null
  referenceImage?: string | null
}

export type ChapterStoryboard = Storyboard & {
  id?: number
  title?: string
  description?: string
  shot_type?: string
  shotType?: string
  angle?: string
  movement?: string
  action?: string
  dialogue?: string
  narration?: string
  voice_over?: string
  voiceOver?: string
  location?: string
  time?: string
  atmosphere?: string
  image_prompt?: string
  imagePrompt?: string
  video_prompt?: string
  videoPrompt?: string
  character_ids?: number[]
  characterIds?: number[]
  scene_id?: number
  sceneId?: number
  duration?: number | string
  reference_images?: string | string[]
  referenceImages?: string | string[]
  composed_image?: string
  composedImage?: string
  first_frame_image?: string
  firstFrameImage?: string
  last_frame_image?: string
  lastFrameImage?: string
  video_url?: string
  videoUrl?: string
  composed_video_url?: string
  composedVideoUrl?: string
}

export type ChapterMergeData = Record<string, unknown> & {
  id?: number
  merge_id?: number
  mergeId?: number
  status?: string
  error_msg?: string
  errorMsg?: string
  merged_url?: string
  mergedUrl?: string
}

export type ShotImageHistoryItem = {
  frameType: string
  src: string
  createdAt: number
}

export type ShotFrameGeneratePayload = {
  sb?: ChapterStoryboard
  frameType?: string
  quantity?: number | string
}

export type ShotFrameRestorePayload = {
  sb?: ChapterStoryboard
  frameType?: string
  src?: string
}

export type ReplaceCharacterImagePayload = {
  character?: ChapterCharacter
  file?: File
}

export type ReplaceSceneImagePayload = {
  scene?: ChapterScene
  file?: File
}

export type SceneReferenceImagePayload = {
  scene?: ChapterScene
  file?: File
}

export type VideoReferenceOverride = {
  reference_mode?: string
  image_url?: string
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[] | string
  reference_video_urls?: string[] | string
  reference_audio_urls?: string[] | string
}

export type VideoGeneratePayload = {
  storyboard_id?: number
  drama_id: number
  config_id?: number
  prompt: string
  duration: number
  reference_mode?: string
  image_url?: string
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[]
  reference_video_urls?: string[]
  reference_audio_urls?: string[]
}

export function errorMessageFromUnknown(error: unknown, fallback = '操作失败') {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  return fallback
}
