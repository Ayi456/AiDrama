type RouteBody = Record<string, unknown>

export type StoryboardCreateBody = RouteBody & {
  episode_id: number
  storyboard_number?: number | null
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  video_prompt?: string | null
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
  duration?: number | null
  video_prompt?: string | null
  image_prompt?: string | null
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
  videoPrompt?: string | null
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
  | 'duration'
  | 'videoPrompt'
  | 'imagePrompt'
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
  duration?: number | null
  videoPrompt?: string | null
  imagePrompt?: string | null
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
  ['duration', 'duration'],
  ['video_prompt', 'videoPrompt'],
  ['image_prompt', 'imagePrompt'],
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

function hasOwn(body: RouteBody, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

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
    duration: body.duration || 10,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
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
