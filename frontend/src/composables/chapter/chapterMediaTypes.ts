import {
  normalizeApiErrorMessage,
  type DramaCharacter,
  type Scene,
  type Storyboard,
} from '../useApi.ts'

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
  director_intent?: string
  directorIntent?: string
  audience_info_change?: string
  audienceInfoChange?: string
  emotion_shift?: string
  emotionShift?: string
  dramatic_value?: string
  dramaticValue?: string
  atmosphere?: string
  image_prompt?: string
  imagePrompt?: string
  first_frame_prompt?: string
  firstFramePrompt?: string
  last_frame_prompt?: string
  lastFramePrompt?: string
  video_prompt?: string
  videoPrompt?: string
  transition_in?: string
  transitionIn?: string
  transition_out?: string
  transitionOut?: string
  screen_direction?: string
  screenDirection?: string
  audio_bridge?: string
  audioBridge?: string
  negative_prompt?: string
  negativePrompt?: string
  fallback_plan?: string
  fallbackPlan?: string
  handle_in_ms?: number
  handleInMs?: number
  handle_out_ms?: number
  handleOutMs?: number
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

export type ManualCharacterPayload = {
  name?: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
  image_prompt?: string
  imagePrompt?: string
  character_asset_id?: number | null
  characterAssetId?: number | null
  file?: File | null
}

export type ManualScenePayload = {
  location?: string
  time?: string
  prompt?: string
  file?: File | null
}

export type VideoReferenceOverride = {
  reference_mode?: string
  image_url?: string
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[] | string
  reference_video_urls?: string[] | string
  reference_audio_urls?: string[] | string
  reference_image_bindings?: VideoReferenceBinding[]
  reference_video_bindings?: VideoReferenceBinding[]
  reference_audio_bindings?: VideoReferenceBinding[]
}

export type VideoReferenceBinding = {
  url?: string
  label?: string
  source?: string
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
  if (error instanceof Error) return normalizeApiErrorMessage(error.message, fallback)
  if (typeof error === 'string') return normalizeApiErrorMessage(error, fallback)
  return fallback
}
