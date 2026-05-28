import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { runExtractorAgent, runChunkedStoryboardBreaker } from '../../routes/actions/agent.js'
import { generateCharacterImageBatch } from '../../routes/resources/characters.js'
import { generateSceneImage } from '../../routes/resources/scenes.js'
import { generateStoryboardVideo } from '../../routes/resources/videos.js'
import { mergeEpisodeVideos } from '../merge/ffmpeg-merge.js'
import { imageGate, videoGate, resizeGates } from './concurrency-gate.js'
import {
  STAGE_ORDER,
  isExtractCompleteFromCounts,
  nextStage,
  terminalStage,
  type AutomationStage,
} from './stage-policy.js'
import { buildAutomationVideoReferences } from './video-reference-policy.js'
import { resolvePreviousTailFrameState } from './previous-tail-frame-policy.js'
import { captureAndPersistTailFrame } from './tail-frame-capture.js'

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

export { STAGE_ORDER, nextStage, terminalStage, type AutomationStage }

export type StageContext = { episodeId: number; dramaId: number }
export type StageHandler = {
  enter: (ctx: StageContext) => Promise<void>
  isComplete: (ctx: StageContext) => Promise<boolean>
}

const noop: StageHandler = {
  enter: async () => {},
  isComplete: async () => true,
}

export { isExtractCompleteFromCounts }

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

const shotImageHandler: StageHandler = noop

async function hasInFlightVideoForStoryboard(storyboardId: number): Promise<boolean> {
  const rows = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.storyboardId, storyboardId))
  return rows.some(r => {
    if (r.defectCheckParentId) return false
    const status = r.status ?? 'pending'
    return status === 'pending' || status === 'processing'
  })
}

const videoHandler: StageHandler = {
  enter: async (ctx) => {
    const sbs = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, ctx.episodeId)))
      .sort((a, b) => (a.storyboardNumber ?? 0) - (b.storyboardNumber ?? 0))
    if (!sbs.length) return

    const firstPending = sbs.findIndex(sb => !sb.videoUrl)
    if (firstPending < 0) return
    const sb = sbs[firstPending]
    if (await hasInFlightVideoForStoryboard(sb.id)) return

    const prev = firstPending > 0 ? sbs[firstPending - 1] : null

    let previousTailFrameUrl: string | null = null
    if (prev) {
      const prevVideos = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.storyboardId, prev.id))
      const latest = prevVideos
        .filter(r => !r.defectCheckParentId && r.status === 'completed')
        .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
      const previousTailFrame = resolvePreviousTailFrameState({
        storyboardLastFrameImage: prev.lastFrameImage,
        videoGeneration: latest,
      })
      previousTailFrameUrl = previousTailFrame.url
      if (!previousTailFrameUrl && previousTailFrame.captureVideoGenerationId && previousTailFrame.captureLocalPath) {
        previousTailFrameUrl = await captureAndPersistTailFrame(
          previousTailFrame.captureVideoGenerationId,
          previousTailFrame.captureLocalPath,
        )
      }
    }

    const [characterLinks, characters, scenes] = await Promise.all([
      db.select().from(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, sb.id)),
      db.select().from(schema.characters).where(eq(schema.characters.dramaId, ctx.dramaId)),
      db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, ctx.dramaId)),
    ])

    const references = buildAutomationVideoReferences({
      storyboard: sb,
      previousTailFrameUrl,
      requirePreviousTailFrame: firstPending > 0,
      characterIds: characterLinks.map(link => link.characterId),
      characters,
      scenes,
    })

    await syncGateSizes()
    const release = await videoGate().acquire()
    try {
      await generateStoryboardVideo({
        storyboardId: sb.id,
        referenceMode: references.referenceMode,
        referenceImageUrls: references.referenceImageUrls,
      })
    } finally { release() }
  },
  isComplete: async (ctx) => {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, ctx.episodeId))
    return sbs.length > 0 && sbs.every(sb => !!sb.videoUrl)
  },
}

const mergeHandler: StageHandler = {
  enter: async (ctx) => {
    const existing = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, ctx.episodeId))
    if (existing.some(r => r.status === 'completed')) return
    if (existing.some(r => r.status === 'pending' || r.status === 'processing')) return
    await mergeEpisodeVideos(ctx.episodeId, ctx.dramaId)
  },
  isComplete: async (ctx) => {
    const rows = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, ctx.episodeId))
    return rows.some(r => r.status === 'completed')
  },
}

export const handlers: Record<Exclude<AutomationStage, 'done'>, StageHandler> = {
  extract: extractHandler,
  character_image: characterImageHandler,
  scene_image: sceneImageHandler,
  shot_image: shotImageHandler,
  video: videoHandler,
  merge: mergeHandler,
}
