import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { runExtractorAgent, runChunkedStoryboardBreaker } from '../../routes/actions/agent.js'
import { generateCharacterImageBatch } from '../../routes/resources/characters.js'
import { generateSceneImage } from '../../routes/resources/scenes.js'
import { generateStoryboardFrame } from '../../routes/actions/grid.js'
import { imageGate, resizeGates } from './concurrency-gate.js'

type InFlightImageKeys = {
  storyboardFirst: Set<number>
  storyboardLast: Set<number>
  characters: Set<number>
  scenes: Set<number>
}

async function loadInFlightImageKeys(episodeId: number): Promise<InFlightImageKeys> {
  const sbRows = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
  const sbIdSet = new Set(sbRows.map(r => r.id))
  const ec = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId))
  const charIdSet = new Set(ec.map(r => r.characterId))
  const es = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId))
  const sceneIdSet = new Set(es.map(r => r.sceneId))

  const imgRows = await db.select().from(schema.imageGenerations)
  const result: InFlightImageKeys = {
    storyboardFirst: new Set<number>(),
    storyboardLast: new Set<number>(),
    characters: new Set<number>(),
    scenes: new Set<number>(),
  }
  for (const row of imgRows) {
    const status = row.status ?? 'pending'
    if (status !== 'pending' && status !== 'processing') continue
    if (row.storyboardId && sbIdSet.has(row.storyboardId)) {
      if (row.frameType === 'first_frame') result.storyboardFirst.add(row.storyboardId)
      else if (row.frameType === 'last_frame') result.storyboardLast.add(row.storyboardId)
    }
    if (row.characterId && charIdSet.has(row.characterId)) {
      result.characters.add(row.characterId)
    }
    if (row.sceneId && sceneIdSet.has(row.sceneId)) {
      result.scenes.add(row.sceneId)
    }
  }
  return result
}

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

async function syncGateSizes() {
  const prefs = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, 'default'))
  const p = prefs[0]
  resizeGates(p?.autoPipelineConcurrencyImage ?? 4, p?.autoPipelineConcurrencyVideo ?? 2)
}

const characterImageHandler: StageHandler = {
  enter: async (ctx) => {
    await syncGateSizes()
    const ec = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, ctx.episodeId))
    const charIds = ec.map(r => r.characterId)
    if (!charIds.length) return
    const chars = await db.select().from(schema.characters)
    const charIdSet = new Set(charIds)
    const inFlight = await loadInFlightImageKeys(ctx.episodeId)
    const need = chars.filter(c => charIdSet.has(c.id) && !c.imageUrl && !inFlight.characters.has(c.id))
    if (!need.length) return
    await Promise.all(need.map(async (char) => {
      const release = await imageGate().acquire()
      try { await generateCharacterImageBatch(ctx.episodeId, [char.id]) }
      catch (err) { console.warn('[automation] character image failed', char.id, err) }
      finally { release() }
    }))
  },
  isComplete: async (ctx) => {
    const ec = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, ctx.episodeId))
    if (!ec.length) return false
    const charIds = new Set(ec.map(r => r.characterId))
    const chars = await db.select().from(schema.characters)
    const need = chars.filter(c => charIds.has(c.id))
    return need.length > 0 && need.every(c => !!c.imageUrl)
  },
}

const sceneImageHandler: StageHandler = {
  enter: async (ctx) => {
    await syncGateSizes()
    const es = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, ctx.episodeId))
    const sceneIds = es.map(r => r.sceneId)
    if (!sceneIds.length) return
    const all = await db.select().from(schema.scenes)
    const sceneIdSet = new Set(sceneIds)
    const inFlight = await loadInFlightImageKeys(ctx.episodeId)
    const need = all.filter(s => sceneIdSet.has(s.id) && !s.imageUrl && !inFlight.scenes.has(s.id))
    await Promise.all(need.map(async (scene) => {
      const release = await imageGate().acquire()
      try { await generateSceneImage(scene.id, ctx.episodeId) }
      catch (err) { console.warn('[automation] scene image failed', scene.id, err) }
      finally { release() }
    }))
  },
  isComplete: async (ctx) => {
    const es = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, ctx.episodeId))
    if (!es.length) return true
    const ids = new Set(es.map(r => r.sceneId))
    const all = await db.select().from(schema.scenes)
    return all.filter(s => ids.has(s.id)).every(s => !!s.imageUrl)
  },
}

const shotImageHandler: StageHandler = {
  enter: async (ctx) => {
    await syncGateSizes()
    const sbs = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, ctx.episodeId)))
      .sort((a, b) => (a.storyboardNumber ?? 0) - (b.storyboardNumber ?? 0))
    if (!sbs.length) return
    const lastSb = sbs[sbs.length - 1]
    const inFlight = await loadInFlightImageKeys(ctx.episodeId)

    const firstFrameNeeds = sbs.filter(sb => !sb.firstFrameImage && !inFlight.storyboardFirst.has(sb.id))
    const lastFrameNeeds = !lastSb.lastFrameImage && !inFlight.storyboardLast.has(lastSb.id) ? [lastSb] : []

    if (!firstFrameNeeds.length && !lastFrameNeeds.length) return

    await Promise.all([
      ...firstFrameNeeds.map(async (sb) => {
        const release = await imageGate().acquire()
        try { await generateStoryboardFrame(sb.id, 'first', ctx.episodeId) }
        catch (err) { console.warn('[automation] shot image first failed', sb.id, err) }
        finally { release() }
      }),
      ...lastFrameNeeds.map(async (sb) => {
        const release = await imageGate().acquire()
        try { await generateStoryboardFrame(sb.id, 'last', ctx.episodeId) }
        catch (err) { console.warn('[automation] shot image last failed', sb.id, err) }
        finally { release() }
      }),
    ])
  },
  isComplete: async (ctx) => {
    const sbs = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, ctx.episodeId)))
      .sort((a, b) => (a.storyboardNumber ?? 0) - (b.storyboardNumber ?? 0))
    if (!sbs.length) return false
    const allFirstDone = sbs.every(sb => !!sb.firstFrameImage)
    const lastSb = sbs[sbs.length - 1]
    return allFirstDone && !!lastSb.lastFrameImage
  },
}

export const handlers: Record<Exclude<AutomationStage, 'done'>, StageHandler> = {
  extract: extractHandler,
  character_image: characterImageHandler,
  scene_image: sceneImageHandler,
  shot_image: shotImageHandler,
  video: noop,
  merge: noop,
}
