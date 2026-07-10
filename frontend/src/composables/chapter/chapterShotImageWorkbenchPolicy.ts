import type { ChapterStoryboard } from './chapterMediaTypes.ts'

export type ShotImageStoryboard = ChapterStoryboard & {
  character_names?: string[] | string
  characterNames?: string[] | string
  negative_prompt?: string
  negativePrompt?: string
}

export function resolveFrameAspectRatio(value: string) {
  const parts = String(value || '1:1').split(':')
  const width = Number(parts[0])
  const height = Number(parts[1])
  return width > 0 && height > 0 ? `${width} / ${height}` : '1 / 1'
}

export function deriveShotPrompt(storyboard: ShotImageStoryboard | null | undefined) {
  if (!storyboard) return ''
  const characters = Array.isArray(storyboard.character_names)
    ? storyboard.character_names
    : String(storyboard.characterNames || storyboard.character_names || '')
      .split(/[、,，]/)
      .map(item => item.trim())
      .filter(Boolean)

  return [
    storyboard.title ? `镜头标题：${storyboard.title}` : '',
    storyboard.description ? `画面描述：${storyboard.description}` : '',
    storyboard.shot_type || storyboard.shotType ? `景别：${storyboard.shot_type || storyboard.shotType}` : '',
    storyboard.angle ? `机位：${storyboard.angle}` : '',
    storyboard.movement ? `运镜：${storyboard.movement}` : '',
    storyboard.location ? `地点：${storyboard.location}` : '',
    storyboard.time ? `时间：${storyboard.time}` : '',
    storyboard.action ? `动作：${storyboard.action}` : '',
    storyboard.atmosphere ? `氛围：${storyboard.atmosphere}` : '',
    characters.length ? `角色：${characters.join('、')}` : '',
    '请生成电影感强、构图清晰、主体明确的单帧画面。',
  ].filter(Boolean).join('\n')
}
