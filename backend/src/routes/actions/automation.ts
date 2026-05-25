import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { start, cancel, resume, abort } from '../../services/automation/episode-orchestrator.js'

export type DerivedProgress = { current: number; total: number; label: string }
export type ProgressInput =
  | { stage: 'extract'; counts: { storyboards: number } }
  | { stage: 'character_image'; counts: { characters: number; charactersWithImage: number } }
  | { stage: 'scene_image'; counts: { scenes: number; scenesWithImage: number } }
  | { stage: 'shot_image'; counts: { storyboards: number; firstFrames: number } }
  | { stage: 'video'; counts: { storyboards: number; videos: number } }
  | { stage: 'merge'; counts: { merged: boolean } }
  | { stage: 'done'; counts: {} }

export function computeDerivedProgress(input: ProgressInput): DerivedProgress {
  switch (input.stage) {
    case 'extract': return { current: input.counts.storyboards > 0 ? 1 : 0, total: 1, label: '提取角色与分镜' }
    case 'character_image': return { current: input.counts.charactersWithImage, total: input.counts.characters, label: '生成角色图' }
    case 'scene_image': return { current: input.counts.scenesWithImage, total: input.counts.scenes, label: '生成场景图' }
    case 'shot_image': return { current: input.counts.firstFrames, total: input.counts.storyboards, label: '生成镜头图' }
    case 'video': return { current: input.counts.videos, total: input.counts.storyboards, label: '生成镜头视频' }
    case 'merge': return { current: input.counts.merged ? 1 : 0, total: 1, label: '拼接视频' }
    case 'done': return { current: 1, total: 1, label: '已完成' }
  }
}

export function normalizePatchAction(action: string): 'cancel' | 'resume' | 'abort' | null {
  if (action === 'cancel' || action === 'resume' || action === 'abort') return action
  return null
}

const app = new Hono()

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
  const action = normalizePatchAction(body?.action ?? '')
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
  const stage = (ep.automationStage ?? 'extract') as ProgressInput['stage']

  let progress: DerivedProgress
  if (stage === 'extract') {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    progress = computeDerivedProgress({ stage, counts: { storyboards: sbs.length } })
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
    progress = computeDerivedProgress({ stage, counts: { characters: total, charactersWithImage: done } })
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
    progress = computeDerivedProgress({ stage, counts: { scenes: total, scenesWithImage: done } })
  } else if (stage === 'shot_image') {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    progress = computeDerivedProgress({ stage, counts: {
      storyboards: sbs.length,
      firstFrames: sbs.filter(sb => !!sb.firstFrameImage).length,
    } })
  } else if (stage === 'video') {
    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    progress = computeDerivedProgress({ stage, counts: {
      storyboards: sbs.length,
      videos: sbs.filter(sb => !!sb.videoUrl).length,
    } })
  } else if (stage === 'merge') {
    const mr = await db.select().from(schema.videoMerges).where(and(eq(schema.videoMerges.episodeId, episodeId), eq(schema.videoMerges.status, 'completed')))
    progress = computeDerivedProgress({ stage, counts: { merged: mr.length > 0 } })
  } else {
    progress = computeDerivedProgress({ stage: 'done', counts: {} })
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
