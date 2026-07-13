import type { RouteBody } from '../shared/route-body.js'
import { hasOwn } from '../shared/route-body.js'
import {
  DEFAULT_STORYBOARD_DURATION_SECONDS,
  normalizeVideoGenerationDuration,
} from '../../services/media/generation/video-duration-policy.js'

export type StoryboardCreateBody = RouteBody & {
  episode_id: number
  storyboard_number?: number | null
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  director_intent?: string | null
  audience_info_change?: string | null
  emotion_shift?: string | null
  dramatic_value?: string | null
  video_prompt?: string | null
  image_prompt?: string | null
  first_frame_prompt?: string | null
  last_frame_prompt?: string | null
  transition_in?: string | null
  transition_out?: string | null
  screen_direction?: string | null
  audio_bridge?: string | null
  negative_prompt?: string | null
  fallback_plan?: string | null
  handle_in_ms?: number | null
  handle_out_ms?: number | null
  scene_id?: number | null
  duration?: number | null
  character_ids?: number[] | null
}

export type StoryboardUpdateBody = RouteBody & {
  title?: string | null
  description?: string | null
  shot_type?: string | null
  angle?: string | null
  movement?: string | null
  action?: string | null
  dialogue?: string | null
  director_intent?: string | null
  audience_info_change?: string | null
  emotion_shift?: string | null
  dramatic_value?: string | null
  duration?: number | null
  video_prompt?: string | null
  image_prompt?: string | null
  first_frame_prompt?: string | null
  last_frame_prompt?: string | null
  transition_in?: string | null
  transition_out?: string | null
  screen_direction?: string | null
  audio_bridge?: string | null
  negative_prompt?: string | null
  fallback_plan?: string | null
  handle_in_ms?: number | null
  handle_out_ms?: number | null
  scene_id?: number | null
  location?: string | null
  time?: string | null
  atmosphere?: string | null
  result?: string | null
  bgm_prompt?: string | null
  sound_effect?: string | null
  video_url?: string | null
  transition_type?: string | null
  transition_duration_ms?: number | null
  character_ids?: number[] | null
}

export type StoryboardCreateValues = {
  episodeId: number
  storyboardNumber: number
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  directorIntent?: string | null
  audienceInfoChange?: string | null
  emotionShift?: string | null
  dramaticValue?: string | null
  videoPrompt?: string | null
  imagePrompt?: string | null
  firstFramePrompt?: string | null
  lastFramePrompt?: string | null
  transitionIn?: string | null
  transitionOut?: string | null
  screenDirection?: string | null
  audioBridge?: string | null
  negativePrompt?: string | null
  fallbackPlan?: string | null
  handleInMs?: number | null
  handleOutMs?: number | null
  sceneId?: number | null
  duration: number
  createdAt: string
  updatedAt: string
}

type StoryboardPatchField =
  | 'title'
  | 'description'
  | 'shotType'
  | 'angle'
  | 'movement'
  | 'action'
  | 'dialogue'
  | 'directorIntent'
  | 'audienceInfoChange'
  | 'emotionShift'
  | 'dramaticValue'
  | 'duration'
  | 'videoPrompt'
  | 'imagePrompt'
  | 'firstFramePrompt'
  | 'lastFramePrompt'
  | 'transitionIn'
  | 'transitionOut'
  | 'screenDirection'
  | 'audioBridge'
  | 'negativePrompt'
  | 'fallbackPlan'
  | 'handleInMs'
  | 'handleOutMs'
  | 'sceneId'
  | 'location'
  | 'time'
  | 'atmosphere'
  | 'result'
  | 'bgmPrompt'
  | 'soundEffect'
  | 'videoUrl'
  | 'transitionType'
  | 'transitionDurationMs'

export type StoryboardUpdatePatch = {
  updatedAt: string
  title?: string | null
  description?: string | null
  shotType?: string | null
  angle?: string | null
  movement?: string | null
  action?: string | null
  dialogue?: string | null
  directorIntent?: string | null
  audienceInfoChange?: string | null
  emotionShift?: string | null
  dramaticValue?: string | null
  duration?: number | null
  videoPrompt?: string | null
  imagePrompt?: string | null
  firstFramePrompt?: string | null
  lastFramePrompt?: string | null
  transitionIn?: string | null
  transitionOut?: string | null
  screenDirection?: string | null
  audioBridge?: string | null
  negativePrompt?: string | null
  fallbackPlan?: string | null
  handleInMs?: number | null
  handleOutMs?: number | null
  sceneId?: number | null
  location?: string | null
  time?: string | null
  atmosphere?: string | null
  result?: string | null
  bgmPrompt?: string | null
  soundEffect?: string | null
  videoUrl?: string | null
  transitionType?: string | null
  transitionDurationMs?: number | null
}

type StoryboardUpdateKey = Exclude<keyof StoryboardUpdateBody, 'character_ids'>

const STORYBOARD_UPDATE_FIELDS = [
  ['title', 'title'],
  ['description', 'description'],
  ['shot_type', 'shotType'],
  ['angle', 'angle'],
  ['movement', 'movement'],
  ['action', 'action'],
  ['dialogue', 'dialogue'],
  ['director_intent', 'directorIntent'],
  ['audience_info_change', 'audienceInfoChange'],
  ['emotion_shift', 'emotionShift'],
  ['dramatic_value', 'dramaticValue'],
  ['duration', 'duration'],
  ['video_prompt', 'videoPrompt'],
  ['image_prompt', 'imagePrompt'],
  ['first_frame_prompt', 'firstFramePrompt'],
  ['last_frame_prompt', 'lastFramePrompt'],
  ['transition_in', 'transitionIn'],
  ['transition_out', 'transitionOut'],
  ['screen_direction', 'screenDirection'],
  ['audio_bridge', 'audioBridge'],
  ['negative_prompt', 'negativePrompt'],
  ['fallback_plan', 'fallbackPlan'],
  ['handle_in_ms', 'handleInMs'],
  ['handle_out_ms', 'handleOutMs'],
  ['scene_id', 'sceneId'],
  ['location', 'location'],
  ['time', 'time'],
  ['atmosphere', 'atmosphere'],
  ['result', 'result'],
  ['bgm_prompt', 'bgmPrompt'],
  ['sound_effect', 'soundEffect'],
  ['video_url', 'videoUrl'],
  ['transition_type', 'transitionType'],
  ['transition_duration_ms', 'transitionDurationMs'],
] as const satisfies readonly (readonly [StoryboardUpdateKey, StoryboardPatchField])[]

export function appendDialogueToVideoPrompt(
  videoPrompt?: string | null,
  dialogue?: string | null,
) {
  const normalizedPrompt = String(videoPrompt || '').trim()
  const normalizedDialogue = String(dialogue || '').trim()
  if (!normalizedDialogue) return normalizedPrompt
  if (
    normalizedPrompt.includes(normalizedDialogue) ||
    normalizedPrompt.includes('对白/旁白')
  ) {
    return normalizedPrompt
  }
  return [normalizedPrompt, `对白/旁白：${normalizedDialogue}`].filter(Boolean).join('\n')
}

export function buildStoryboardCreateValues(body: StoryboardCreateBody, timestamp: string): StoryboardCreateValues {
  const values: StoryboardCreateValues = {
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    sceneId: body.scene_id,
    duration: normalizeVideoGenerationDuration(body.duration, DEFAULT_STORYBOARD_DURATION_SECONDS),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  if (hasOwn(body, 'director_intent')) values.directorIntent = body.director_intent
  if (hasOwn(body, 'audience_info_change')) values.audienceInfoChange = body.audience_info_change
  if (hasOwn(body, 'emotion_shift')) values.emotionShift = body.emotion_shift
  if (hasOwn(body, 'dramatic_value')) values.dramaticValue = body.dramatic_value
  if (hasOwn(body, 'image_prompt')) values.imagePrompt = body.image_prompt
  if (hasOwn(body, 'first_frame_prompt')) values.firstFramePrompt = body.first_frame_prompt
  if (hasOwn(body, 'last_frame_prompt')) values.lastFramePrompt = body.last_frame_prompt
  if (hasOwn(body, 'transition_in')) values.transitionIn = body.transition_in
  if (hasOwn(body, 'transition_out')) values.transitionOut = body.transition_out
  if (hasOwn(body, 'screen_direction')) values.screenDirection = body.screen_direction
  if (hasOwn(body, 'audio_bridge')) values.audioBridge = body.audio_bridge
  if (hasOwn(body, 'negative_prompt')) values.negativePrompt = body.negative_prompt
  if (hasOwn(body, 'fallback_plan')) values.fallbackPlan = body.fallback_plan
  if (hasOwn(body, 'handle_in_ms')) values.handleInMs = body.handle_in_ms
  if (hasOwn(body, 'handle_out_ms')) values.handleOutMs = body.handle_out_ms
  const videoPrompt = appendDialogueToVideoPrompt(body.video_prompt, body.dialogue)
  if (videoPrompt) values.videoPrompt = videoPrompt
  return values
}

export function buildStoryboardUpdatePatch(body: StoryboardUpdateBody, updatedAt: string): StoryboardUpdatePatch {
  const updates: StoryboardUpdatePatch = { updatedAt }
  const target = updates as Record<string, unknown>

  for (const [sourceKey, targetKey] of STORYBOARD_UPDATE_FIELDS) {
    if (hasOwn(body, sourceKey)) target[targetKey] = body[sourceKey]
  }
  if (hasOwn(body, 'duration') && body.duration != null) {
    updates.duration = normalizeVideoGenerationDuration(body.duration, DEFAULT_STORYBOARD_DURATION_SECONDS)
  }

  if (hasOwn(body, 'video_prompt')) {
    updates.videoPrompt = appendDialogueToVideoPrompt(body.video_prompt, body.dialogue)
  }

  return updates
}

export function resolveStoryboardBindingInput(
  body: StoryboardUpdateBody,
  storyboard: { sceneId: number | null },
  currentCharacterIds: number[],
) {
  return {
    sceneId: hasOwn(body, 'scene_id') ? body.scene_id : storyboard.sceneId,
    characterIds: hasOwn(body, 'character_ids') ? body.character_ids ?? [] : currentCharacterIds,
  }
}

export function buildStoryboardCreateLogContext(body: StoryboardCreateBody) {
  return {
    episodeId: body.episode_id,
    shotNumber: body.storyboard_number || 1,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  }
}
