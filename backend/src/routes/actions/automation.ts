import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { start, cancel, resume, abort, advance, resumeRunningEpisodes } from '../../services/automation/episode-orchestrator.js'
import { getAutomationProgress } from '../../services/automation/progress-state.js'
import { normalizeAutomationStage } from '../../services/automation/stage-policy.js'
import * as automationRoutePolicy from '../policies/automation-route-policy.js'

export type DerivedProgress = automationRoutePolicy.DerivedProgress
export type ProgressInput = automationRoutePolicy.ProgressInput

export function computeDerivedProgress(input: ProgressInput): DerivedProgress {
  return automationRoutePolicy.computeDerivedProgress(input)
}

export function normalizePatchAction(action: string): 'cancel' | 'resume' | 'abort' | null {
  return automationRoutePolicy.normalizePatchAction(action)
}
const app = new Hono()

// 推进所有 running 集前进一步（无外部 webhook 的 extract 阶段靠它打点）。
// 由 SCF 定时触发器或外部调度周期性调用；幂等，advance 内部有去重。
app.post('/automation/tick', async (c) => {
  const resumed = await resumeRunningEpisodes()
  return c.json({ code: 0, data: { resumed }, message: 'ok' })
})

app.post('/episodes/:id/automation/start', async (c) => {
  const episodeId = Number(c.req.param('id'))
  if (!Number.isFinite(episodeId)) return c.json({ code: 1, data: null, message: 'invalid episode id' }, 400)
  const res = await start(episodeId)
  if (!res.ok) return c.json({ code: 409, data: null, message: res.message ?? 'cannot start' }, 409)
  return c.json({ code: 0, data: { status: res.status }, message: 'ok' })
})

app.patch('/episodes/:id/automation', async (c) => {
  const episodeId = Number(c.req.param('id'))
  if (!Number.isFinite(episodeId)) return c.json({ code: 1, data: null, message: 'invalid episode id' }, 400)
  const body = await c.req.json()
  const action = automationRoutePolicy.normalizePatchAction(body?.action ?? '')
  if (!action) return c.json({ code: 1, data: null, message: 'unknown action' }, 400)
  if (action === 'cancel') await cancel(episodeId)
  else if (action === 'resume') await resume(episodeId)
  else await abort(episodeId)
  return c.json({ code: 0, data: { action }, message: 'ok' })
})

app.get('/episodes/:id/automation', async (c) => {
  const episodeId = Number(c.req.param('id'))
  if (!Number.isFinite(episodeId)) return c.json({ code: 1, data: null, message: 'invalid episode id' }, 400)

  const epRows = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!epRows.length) return c.json({ code: 404, data: null, message: 'episode not found' }, 404)
  const ep = epRows[0]
  if (ep.automationStatus === 'running') {
    void advance(episodeId).catch(err => console.warn('[automation] advance after status read failed', err))
  }
  const stage = normalizeAutomationStage(ep.automationStage)
  const liveProgress = getAutomationProgress(episodeId)

  let progress: DerivedProgress
  if (stage === 'extract') {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    progress = automationRoutePolicy.resolveProgress({ stage, counts: { storyboards: sbs.length } }, liveProgress)
  } else if (stage === 'character_image') {
    const ec = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId))
    const charIds = ec.map(r => r.characterId)
    let total = 0, done = 0
    if (charIds.length) {
      const chars = await db.select().from(schema.characters)
      const set = new Set(charIds)
      const filtered = chars.filter(c => set.has(c.id))
      total = filtered.length
      done = filtered.filter(c => !!c.imageUrl).length
    }
    progress = automationRoutePolicy.resolveProgress({ stage, counts: { characters: total, charactersWithImage: done } }, liveProgress)
  } else if (stage === 'scene_image') {
    const es = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId))
    const sceneIds = es.map(r => r.sceneId)
    let total = 0, done = 0
    if (sceneIds.length) {
      const all = await db.select().from(schema.scenes)
      const set = new Set(sceneIds)
      const filtered = all.filter(s => set.has(s.id))
      total = filtered.length
      done = filtered.filter(s => !!s.imageUrl).length
    }
    progress = automationRoutePolicy.resolveProgress({ stage, counts: { scenes: total, scenesWithImage: done } }, liveProgress)
  } else if (stage === 'video') {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    progress = automationRoutePolicy.resolveProgress({ stage, counts: {
      storyboards: sbs.length,
      videos: sbs.filter(sb => !!sb.videoUrl).length,
    } }, liveProgress)
  } else if (stage === 'merge') {
    const mr = await db.select().from(schema.videoMerges).where(and(eq(schema.videoMerges.episodeId, episodeId), eq(schema.videoMerges.status, 'completed')))
    progress = automationRoutePolicy.resolveProgress({ stage, counts: { merged: mr.length > 0 } }, liveProgress)
  } else {
    progress = automationRoutePolicy.resolveProgress({ stage: 'done', counts: {} }, liveProgress)
  }

  return c.json({ code: 0, data: {
    status: ep.automationStatus ?? 'idle',
    stage,
    attempt: ep.automationAttempt ?? 0,
    error: ep.automationError ?? null,
    progress,
  }, message: 'ok' })
})

export default app
