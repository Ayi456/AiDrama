export type AutomationStage = 'extract' | 'character_image' | 'scene_image' | 'shot_image' | 'video' | 'merge' | 'done'

export const STAGE_ORDER: AutomationStage[] = ['extract', 'character_image', 'scene_image', 'shot_image', 'video', 'merge', 'done']

export function nextStage(current: AutomationStage): AutomationStage {
  const idx = STAGE_ORDER.indexOf(current)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return 'done'
  return STAGE_ORDER[idx + 1]
}

export function terminalStage(): AutomationStage { return 'done' }

export type StageContext = { episodeId: number; dramaId: number }
export type StageHandler = {
  enter: (ctx: StageContext) => Promise<void>
  isComplete: (ctx: StageContext) => Promise<boolean>
}

const noop: StageHandler = {
  enter: async () => {},
  isComplete: async () => true,
}

export const handlers: Record<Exclude<AutomationStage, 'done'>, StageHandler> = {
  extract: noop,
  character_image: noop,
  scene_image: noop,
  shot_image: noop,
  video: noop,
  merge: noop,
}
