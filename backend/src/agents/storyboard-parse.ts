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
  'director_intent',
  'audience_info_change',
  'emotion_shift',
  'dramatic_value',
  'atmosphere',
  'image_prompt',
  'first_frame_prompt',
  'last_frame_prompt',
  'video_prompt',
  'transition_in',
  'transition_out',
  'screen_direction',
  'audio_bridge',
  'negative_prompt',
  'fallback_plan',
  'bgm_prompt',
  'sound_effect',
] as const

const requiredProductionFields = [
  'title',
  'shot_type',
  'angle',
  'movement',
  'location',
  'time',
  'action',
  'description',
  'result',
  'director_intent',
  'audience_info_change',
  'emotion_shift',
  'dramatic_value',
  'atmosphere',
  'image_prompt',
  'first_frame_prompt',
  'last_frame_prompt',
  'video_prompt',
  'transition_in',
  'transition_out',
  'screen_direction',
  'audio_bridge',
  'negative_prompt',
  'fallback_plan',
  'bgm_prompt',
  'sound_effect',
] as const

const requiredVideoPromptSections = [
  '参考素材绑定',
  '主体与场景',
  '入场与首帧',
  '分秒时间轴',
  '运镜与画面',
  '出场与尾帧',
  '声音与对白',
  '画质与风格',
  '约束与禁止项',
  '失败降级',
] as const

type StoryboardTextField = typeof storyboardTextFields[number]

type NormalizedStoryboardInput = {
  shot_number: number
  duration?: number
  handle_in_ms?: number
  handle_out_ms?: number
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
  director_intent: z.string().nullable().optional(),
  audience_info_change: z.string().nullable().optional(),
  emotion_shift: z.string().nullable().optional(),
  dramatic_value: z.string().nullable().optional(),
  atmosphere: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
  first_frame_prompt: z.string().nullable().optional(),
  last_frame_prompt: z.string().nullable().optional(),
  video_prompt: z.string().nullable().optional(),
  transition_in: z.string().nullable().optional(),
  transition_out: z.string().nullable().optional(),
  screen_direction: z.string().nullable().optional(),
  audio_bridge: z.string().nullable().optional(),
  negative_prompt: z.string().nullable().optional(),
  fallback_plan: z.string().nullable().optional(),
  bgm_prompt: z.string().nullable().optional(),
  sound_effect: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  handle_in_ms: z.number().nullable().optional(),
  handle_out_ms: z.number().nullable().optional(),
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
  if (storyboard.handle_in_ms != null) normalized.handle_in_ms = storyboard.handle_in_ms
  if (storyboard.handle_out_ms != null) normalized.handle_out_ms = storyboard.handle_out_ms
  return normalized
})

function extractTimelineRanges(videoPrompt: string) {
  const section = videoPrompt.match(/分秒时间轴[：:]([\s\S]*?)(?=\n(?:运镜与画面|出场与尾帧|声音与对白|画质与风格|约束与禁止项|失败降级)[：:]|$)/)?.[1] || ''
  return [...section.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|—|~|至)\s*(\d+(?:\.\d+)?)\s*秒/g)]
    .map(match => ({ start: Number(match[1]), end: Number(match[2]) }))
}

function validateTimeline(videoPrompt: string, duration: number) {
  const ranges = extractTimelineRanges(videoPrompt)
  if (!ranges.length) return '分秒时间轴必须包含“0.0-1.0秒”格式的连续时间段'
  if (Math.abs(ranges[0].start) > 0.05) return '分秒时间轴必须从 0 秒开始'

  for (let index = 0; index < ranges.length; index += 1) {
    const current = ranges[index]
    if (current.end <= current.start) return '分秒时间轴中的结束时间必须大于开始时间'
    const next = ranges[index + 1]
    if (next && Math.abs(current.end - next.start) > 0.05) {
      return '分秒时间轴不能留空档或发生重叠'
    }
  }

  if (Math.abs(ranges[ranges.length - 1].end - duration) > 0.05) {
    return `分秒时间轴必须准确结束在 duration=${duration} 秒`
  }
  return ''
}

// 分镜结构化输出的 schema。独立于工具与 DB，便于直连解析与单测复用。
export const storyboardInputSchema = z.object({
  storyboards: z.array(rawStoryboardInputSchema).min(1),
}).superRefine((value, ctx) => {
  const seenShotNumbers = new Set<number>()

  value.storyboards.forEach((storyboard, index) => {
    if (!Number.isInteger(storyboard.shot_number) || storyboard.shot_number < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['storyboards', index, 'shot_number'],
        message: '分镜编号必须是正整数',
      })
    }

    if (seenShotNumbers.has(storyboard.shot_number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['storyboards', index, 'shot_number'],
        message: `分镜编号重复：${storyboard.shot_number}`,
      })
    }
    seenShotNumbers.add(storyboard.shot_number)

    const title = String(storyboard.title || '').trim()
    const isPlaceholderTitle = /^镜头\s*\d+$/i.test(title) || /^shot\s*\d+$/i.test(title)
    const hasCoreProductionContent = [
      storyboard.description,
      storyboard.action,
      storyboard.result,
      storyboard.dialogue,
      storyboard.image_prompt,
    ].some((field) => String(field || '').trim())

    if (isPlaceholderTitle && !hasCoreProductionContent) {
      ctx.addIssue({
        code: 'custom',
        path: ['storyboards', index, 'title'],
        message: `占位镜头缺少可拍摄内容：${title}`,
      })
    }

    for (const field of requiredProductionFields) {
      if (!String(storyboard[field] || '').trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['storyboards', index, field],
          message: `缺少必填生产字段：${field}`,
        })
      }
    }

    if (!Number.isInteger(storyboard.duration) || Number(storyboard.duration) < 4 || Number(storyboard.duration) > 15) {
      ctx.addIssue({
        code: 'custom',
        path: ['storyboards', index, 'duration'],
        message: 'duration 必须是 4-15 的整数',
      })
    }

    for (const field of ['handle_in_ms', 'handle_out_ms'] as const) {
      const handle = storyboard[field]
      if (!Number.isInteger(handle) || Number(handle) < 0 || Number(handle) > 1500) {
        ctx.addIssue({
          code: 'custom',
          path: ['storyboards', index, field],
          message: `${field} 必须是 0-1500 的整数毫秒`,
        })
      }
    }

    const videoPrompt = String(storyboard.video_prompt || '')
    for (const section of requiredVideoPromptSections) {
      if (!videoPrompt.includes(section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['storyboards', index, 'video_prompt'],
          message: `video_prompt 缺少结构段：${section}`,
        })
      }
    }

    if (/动作节奏|动作阶段\s*\d/.test(videoPrompt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['storyboards', index, 'video_prompt'],
        message: 'Seedance 2.0 提示词必须使用分秒时间轴，不能继续使用动作阶段',
      })
    }

    const duration = Number(storyboard.duration)
    if (Number.isFinite(duration)) {
      const timelineError = validateTimeline(videoPrompt, duration)
      if (timelineError) {
        ctx.addIssue({
          code: 'custom',
          path: ['storyboards', index, 'video_prompt'],
          message: timelineError,
        })
      } else {
        const ranges = extractTimelineRanges(videoPrompt)
        const handleInSeconds = Number(storyboard.handle_in_ms) / 1000
        const handleOutSeconds = Number(storyboard.handle_out_ms) / 1000
        if (handleInSeconds > 0 && Math.abs(ranges[0].end - handleInSeconds) > 0.05) {
          ctx.addIssue({
            code: 'custom',
            path: ['storyboards', index, 'video_prompt'],
            message: '分秒时间轴第一段必须准确覆盖 handle_in_ms',
          })
        }
        if (handleOutSeconds > 0 && Math.abs(duration - ranges[ranges.length - 1].start - handleOutSeconds) > 0.05) {
          ctx.addIssue({
            code: 'custom',
            path: ['storyboards', index, 'video_prompt'],
            message: '分秒时间轴最后一段必须准确覆盖 handle_out_ms',
          })
        }
      }
    }

  })
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
