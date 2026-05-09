import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { mergeEpisodeVideos } from '../services/merge/ffmpeg-merge.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { isStaleProcessingMerge, resolveStaleMergeTimeoutMs } from '../services/merge/merge-status.js'

const app = new Hono()

async function readJsonBody(c: any) {
  try {
    return await c.req.json()
  } catch {
    return {}
  }
}

function selectedStoryboardIdsFromBody(body: any): number[] | undefined {
  const raw = body?.storyboard_ids ?? body?.storyboardIds
  if (!Array.isArray(raw)) return undefined

  return Array.from(new Set(
    raw
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0),
  ))
}

// POST /episodes/:id/merge — 拼接全集视频
app.post('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = (await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all())
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    const body = await readJsonBody(c)
    const storyboardIds = selectedStoryboardIdsFromBody(body)
    logTaskStart('MergeAPI', 'episode-merge', { episodeId, dramaId: ep.dramaId, storyboardIds })
    const mergeId = await mergeEpisodeVideos(episodeId, ep.dramaId, { storyboardIds })
    logTaskSuccess('MergeAPI', 'episode-merge', { episodeId, mergeId, storyboardIds })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (err: any) {
    logTaskError('MergeAPI', 'episode-merge', { episodeId, error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /episodes/:id/merge — 查询拼接状态
app.get('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const merges = (await db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all())

  const latest = merges[merges.length - 1]
  if (!latest) return success(c, null)

  if (isStaleProcessingMerge(latest)) {
    const timeoutMinutes = Math.round(resolveStaleMergeTimeoutMs() / 60_000)
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
      episodeId,
      mergeId: latest.id,
      timeoutMinutes,
    })
  }

  return success(c, toSnakeCase(latest))
})

export default app
