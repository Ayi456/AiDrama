import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest, now } from '../../utils/response.js'
import { ensureMergeJobRunning, isMergeJobRunning, mergeEpisodeVideos } from '../../services/merge/ffmpeg-merge.js'
import { toSnakeCase } from '../../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess, logTaskWarn } from '../../utils/task-logger.js'
import { isStaleProcessingMerge, resolveStaleMergeTimeoutMs } from '../../services/merge/merge-status.js'
import { errorMessageFromUnknown } from '../../utils/error.js'
import { readJsonBody } from '../shared/route-body.js'
import { selectedStoryboardIdsFromBody } from '../policies/merge-route-policy.js'

const app = new Hono()

// POST /chapters/:id/merge — 拼接全集视频
app.post('/chapters/:id/merge', async (c) => {
  const chapterId = Number(c.req.param('id'))
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, chapterId)).all())
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    const body = await readJsonBody(c)
    const storyboardIds = selectedStoryboardIdsFromBody(body)
    logTaskStart('MergeAPI', 'chapter-merge', { episodeId: chapterId, dramaId: ep.dramaId, storyboardIds })
    const mergeId = await mergeEpisodeVideos(chapterId, ep.dramaId, { storyboardIds })
    logTaskSuccess('MergeAPI', 'chapter-merge', { episodeId: chapterId, mergeId, storyboardIds })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Merge failed')
    logTaskError('MergeAPI', 'chapter-merge', { episodeId: chapterId, error: message })
    return badRequest(c, message)
  }
})

// GET /chapters/:id/merge — 查询拼接状态
app.get('/chapters/:id/merge', async (c) => {
  const chapterId = Number(c.req.param('id'))
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
