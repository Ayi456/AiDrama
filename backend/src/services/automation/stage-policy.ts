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
