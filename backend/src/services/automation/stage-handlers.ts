import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { runExtractorAgent, runChunkedStoryboardBreaker } from '../../routes/actions/agent.js'

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

export function isExtractCompleteFromCounts(counts: { storyboards: number; episodeCharacters: number; episodeScenes: number }): boolean {
  return counts.storyboards > 0 && counts.episodeCharacters > 0
}

async function loadExtractCounts(episodeId: number) {
  const [sbs, ecs, ess] = await Promise.all([
    db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)),
    db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId)),
    db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId)),
  ])
  return { storyboards: sbs.length, episodeCharacters: ecs.length, episodeScenes: ess.length }
}

export async function isExtractComplete(ctx: StageContext): Promise<boolean> {
  const c = await loadExtractCounts(ctx.episodeId)
  return isExtractCompleteFromCounts(c)
}

const extractHandler: StageHandler = {
  enter: async (ctx) => {
    const counts = await loadExtractCounts(ctx.episodeId)
    if (counts.episodeCharacters === 0) await runExtractorAgent(ctx.dramaId, ctx.episodeId)
    const after = await loadExtractCounts(ctx.episodeId)
    if (after.storyboards === 0) await runChunkedStoryboardBreaker(ctx.dramaId, ctx.episodeId)
  },
  isComplete: isExtractComplete,
}

export const handlers: Record<Exclude<AutomationStage, 'done'>, StageHandler> = {
  extract: extractHandler,
  character_image: noop,
  scene_image: noop,
  shot_image: noop,
  video: noop,
  merge: noop,
}
