import { z } from 'zod'

const storyboardTextFields = [
  'title',
  'shot_type',
  'angle',
  'movement',
  'location',
  'time',
  'action',
  'dialogue',
  'description',
  'result',
  'atmosphere',
  'image_prompt',
  'video_prompt',
  'bgm_prompt',
  'sound_effect',
] as const

type StoryboardTextField = typeof storyboardTextFields[number]

type NormalizedStoryboardInput = {
  shot_number: number
  duration?: number
  scene_id: number | null
  character_ids: number[]
} & Partial<Record<StoryboardTextField, string>>

const rawStoryboardInputSchema = z.object({
  shot_number: z.number(),
  title: z.string().nullable().optional(),
  shot_type: z.string().nullable().optional(),
  angle: z.string().nullable().optional(),
  movement: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  dialogue: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  atmosphere: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
  video_prompt: z.string().nullable().optional(),
  bgm_prompt: z.string().nullable().optional(),
  sound_effect: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  scene_id: z.number().nullable().optional(),
  character_ids: z.array(z.number()).nullable().optional(),
}).transform((storyboard): NormalizedStoryboardInput => {
  const normalized: NormalizedStoryboardInput = {
    shot_number: storyboard.shot_number,
    scene_id: storyboard.scene_id ?? null,
    character_ids: storyboard.character_ids ?? [],
  }

  for (const field of storyboardTextFields) {
    const value = storyboard[field]
    if (value != null) normalized[field] = value
  }

  if (storyboard.duration != null) normalized.duration = storyboard.duration
  return normalized
})

// 分镜结构化输出的 schema。独立于工具与 DB，便于直连解析与单测复用。
export const storyboardInputSchema = z.object({
  storyboards: z.array(rawStoryboardInputSchema).min(1),
})

export type StoryboardInput = z.infer<typeof storyboardInputSchema>['storyboards'][number]

// 从模型自由文本里扒出 JSON 主体：兼容 ```json 围栏、前后多余说明文字。
export function extractJsonCandidate(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

// 解析模型返回的分镜 JSON 文本，校验结构后返回镜头数组。失败抛出可读错误。
export function parseStoryboardsFromText(text: string): StoryboardInput[] {
  const candidate = extractJsonCandidate(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    throw new Error('模型未返回合法 JSON')
  }

  const result = storyboardInputSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path?.join('.') || ''
    throw new Error(`分镜 JSON 结构不符合要求${path ? `（${path}）` : ''}：${issue?.message || 'invalid'}`)
  }
  return result.data.storyboards
}
