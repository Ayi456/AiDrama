export type DerivedProgress = { current: number; total: number; label: string }
export type LiveProgressSnapshot = DerivedProgress & { stage: ProgressInput['stage'] }
export type ProgressInput =
  | { stage: 'extract'; counts: { storyboards: number } }
  | { stage: 'character_image'; counts: { characters: number; charactersWithImage: number } }
  | { stage: 'scene_image'; counts: { scenes: number; scenesWithImage: number } }
  | { stage: 'video'; counts: { storyboards: number; videos: number } }
  | { stage: 'merge'; counts: { merged: boolean } }
  | { stage: 'done'; counts: {} }

export function computeDerivedProgress(input: ProgressInput): DerivedProgress {
  switch (input.stage) {
    case 'extract': return { current: input.counts.storyboards > 0 ? 1 : 0, total: 1, label: '提取角色与分镜' }
    case 'character_image': return { current: input.counts.charactersWithImage, total: input.counts.characters, label: '生成角色图' }
    case 'scene_image': return { current: input.counts.scenesWithImage, total: input.counts.scenes, label: '生成场景图' }
    case 'video': return { current: input.counts.videos, total: input.counts.storyboards, label: '生成镜头视频' }
    case 'merge': return { current: input.counts.merged ? 1 : 0, total: 1, label: '拼接视频' }
    case 'done': return { current: 1, total: 1, label: '已完成' }
  }
}

function normalizeProgress(progress: DerivedProgress): DerivedProgress {
  const total = Math.max(0, Math.floor(progress.total || 0))
  const current = Math.max(0, Math.min(total, Math.floor(progress.current || 0)))
  return { current, total, label: progress.label }
}

export function resolveProgress(input: ProgressInput, liveProgress?: LiveProgressSnapshot | null): DerivedProgress {
  if (liveProgress?.stage === input.stage) {
    return normalizeProgress(liveProgress)
  }
  return computeDerivedProgress(input)
}

export function normalizePatchAction(action: string): 'cancel' | 'resume' | 'abort' | null {
  if (action === 'cancel' || action === 'resume' || action === 'abort') return action
  return null
}
