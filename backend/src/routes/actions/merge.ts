import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest, now } from '../../utils/response.js'
import { ensureMergeJobRunning, isMergeJobRunning, mergeEpisodeVideos } from '../../services/merge/ffmpeg-merge.js'
import { getFfmpegDiagnostics } from '../../services/ffmpeg/ffmpeg.js'
import { toSnakeCase } from '../../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess, logTaskWarn } from '../../utils/task-logger.js'
import { isStaleProcessingMerge, resolveStaleMergeTimeoutMs } from '../../services/merge/merge-status.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody } from '../shared/route-body.js'
import {
  selectedMergeClipOverridesFromBody,
  selectedStoryboardIdsFromBody,
} from '../policies/merge-route-policy.js'
import { getCurrentUser } from '../../middleware/auth.js'
import {
  filterOwnedVideoGenerations,
  findOwnedEpisode,
  findOwnedStoryboard,
} from '../shared/ownership.js'

const app = new Hono()

function sameClipUrl(left: unknown, right: unknown) {
  return String(left || '').trim() === String(right || '').trim()
}

async function canUseSelectedMergeClip(
  userId: number,
  storyboard: typeof schema.storyboards.$inferSelect,
  videoUrl: string,
) {
  if (sameClipUrl(storyboard.videoUrl, videoUrl) || sameClipUrl(storyboard.composedVideoUrl, videoUrl)) {
    return true
  }

  const rows = await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.storyboardId, storyboard.id))
    .all()
  const ownedRows = await filterOwnedVideoGenerations(userId, rows)
  return ownedRows.some(row => (
    row.status === 'completed' &&
    (sameClipUrl(row.videoUrl, videoUrl) || sameClipUrl(row.minioUrl, videoUrl))
  ))
}

// GET /diagnostics/ffmpeg — 排查运行时 ffmpeg 环境（版本、路径、xfade 支持）
app.get('/diagnostics/ffmpeg', async (c) => {
  return success(c, toSnakeCase(await getFfmpegDiagnostics()))
})

// POST /chapters/:id/merge — 拼接全集视频
app.post('/chapters/:id/merge', async (c) => {
  const currentUser = getCurrentUser(c)
  const chapterId = Number(c.req.param('id'))
  const ep = await findOwnedEpisode(currentUser.id, chapterId)
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    const body = await readJsonBody(c)
    const storyboardIds = selectedStoryboardIdsFromBody(body)
    const clipOverrides = selectedMergeClipOverridesFromBody(body)
    const storyboardById = new Map<number, typeof schema.storyboards.$inferSelect>()
    for (const storyboardId of storyboardIds || []) {
      const storyboard = await findOwnedStoryboard(currentUser.id, storyboardId)
      if (!storyboard || storyboard.episodeId !== chapterId) return badRequest(c, 'Storyboard not found')
      storyboardById.set(storyboardId, storyboard)
    }
    for (const override of clipOverrides) {
      let storyboard = storyboardById.get(override.storyboardId)
      if (!storyboard) {
        const loadedStoryboard = await findOwnedStoryboard(currentUser.id, override.storyboardId)
        if (!loadedStoryboard || loadedStoryboard.episodeId !== chapterId) return badRequest(c, 'Storyboard not found')
        storyboard = loadedStoryboard
        storyboardById.set(override.storyboardId, storyboard)
      }
      if (!await canUseSelectedMergeClip(currentUser.id, storyboard, override.videoUrl)) {
        return badRequest(c, 'Selected storyboard video not found')
      }
    }
    logTaskStart('MergeAPI', 'chapter-merge', { episodeId: chapterId, dramaId: ep.dramaId, storyboardIds, clipOverrides: clipOverrides.length })
    const mergeId = await mergeEpisodeVideos(chapterId, ep.dramaId, { storyboardIds, clipOverrides })
    logTaskSuccess('MergeAPI', 'chapter-merge', { episodeId: chapterId, mergeId, storyboardIds, clipOverrides: clipOverrides.length })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Merge failed')
    logTaskError('MergeAPI', 'chapter-merge', { episodeId: chapterId, error: message })
    return badRequest(c, message)
  }
})

// GET /chapters/:id/merge — 查询拼接状态
app.get('/chapters/:id/merge', async (c) => {
  const currentUser = getCurrentUser(c)
  const chapterId = Number(c.req.param('id'))
  const ep = await findOwnedEpisode(currentUser.id, chapterId)
  if (!ep) return badRequest(c, 'Episode not found')
  const merges = (await db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, chapterId))
    .all())

  const latest = merges[merges.length - 1]
  if (!latest) return success(c, null)

  if (isStaleProcessingMerge(latest) && !isMergeJobRunning(Number(latest.id))) {
    const timeoutMinutes = Math.round(resolveStaleMergeTimeoutMs(undefined, latest) / 60_000)
    const errorMsg = `Merge task exceeded ${timeoutMinutes} minutes without completion. Please start a new merge.`
    const completedAt = now()
    await db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg, completedAt })
      .where(eq(schema.videoMerges.id, latest.id))
      .run()
    latest.status = 'failed'
    latest.errorMsg = errorMsg
    latest.completedAt = completedAt
    logTaskWarn('MergeAPI', 'stale-processing-merge', {
      episodeId: chapterId,
      mergeId: latest.id,
      timeoutMinutes,
    })
  } else if (latest.status === 'processing') {
    const running = await ensureMergeJobRunning(Number(latest.id))
    if (!running) {
      const [updated] = await db.select().from(schema.videoMerges)
        .where(eq(schema.videoMerges.id, latest.id))
        .all()
      if (updated) Object.assign(latest, updated)
    }
  }

  return success(c, toSnakeCase(latest))
})

export default app
