export type AutomationStage =
  | 'extract'
  | 'character_image'
  | 'scene_image'
  | 'shot_image'
  | 'video'
  | 'merge'
  | 'done'

export const STAGE_ORDER: AutomationStage[] = ['extract', 'character_image', 'scene_image', 'video', 'merge', 'done']

export function nextStage(current: AutomationStage): AutomationStage {
  if (current === 'shot_image') return 'video'
  const idx = STAGE_ORDER.indexOf(current)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return 'done'
  return STAGE_ORDER[idx + 1]
}

export function terminalStage(): AutomationStage { return 'done' }

export function isExtractCompleteFromCounts(counts: { storyboards: number; episodeCharacters: number; episodeScenes: number }): boolean {
  return counts.storyboards > 0 && counts.episodeCharacters > 0
}

export type StoryboardChunkProgress = {
  existingStoryboards: number
  cursor: number
  totalChunks: number
}

// 分镜逐 chunk 拆解的完成判断。游标为已处理的 chunk 数（从 0 开始）。
// 若已存在分镜且游标为 0，视为此前（手动或历史运行）已生成，不再重跑。
export function isStoryboardChunkingComplete(input: StoryboardChunkProgress): boolean {
  if (input.existingStoryboards > 0 && input.cursor === 0) return true
  return input.totalChunks > 0 && input.cursor >= input.totalChunks
}

// 返回下一个待处理的 chunk 序号（1 起）；已完成返回 null。
export function nextStoryboardChunkIndex(input: StoryboardChunkProgress): number | null {
  if (isStoryboardChunkingComplete(input)) return null
  return input.cursor + 1
}
