import { z } from 'zod'

// 分镜结构化输出的 schema。独立于工具与 DB，便于直连解析与单测复用。
export const storyboardInputSchema = z.object({
  storyboards: z.array(z.object({
    shot_number: z.number(),
    title: z.string().optional(),
    shot_type: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    location: z.string().optional(),
    time: z.string().optional(),
    action: z.string().optional(),
    dialogue: z.string().optional(),
    description: z.string().optional(),
    result: z.string().optional(),
    atmosphere: z.string().optional(),
    image_prompt: z.string().optional(),
    video_prompt: z.string().optional(),
    bgm_prompt: z.string().optional(),
    sound_effect: z.string().optional(),
    duration: z.number().optional(),
    scene_id: z.number().nullable().optional(),
    character_ids: z.array(z.number()).optional(),
  })).min(1),
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
