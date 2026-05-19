import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest } from '../../utils/response.js'
import { composeStoryboard } from '../../services/compose/ffmpeg-compose.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { toSnakeCase } from '../../utils/transform.js'
import { errorMessageFromUnknown } from '../../utils/error.js'

const app = new Hono()

// POST /storyboards/:id/compose — 合成单个镜头
app.post('/storyboards/:id/compose', async (c) => {
  const id = Number(c.req.param('id'))
  try {
    logTaskStart('ComposeAPI', 'single-compose', { storyboardId: id })
    const composedUrl = await composeStoryboard(id)
    logTaskSuccess('ComposeAPI', 'single-compose', { storyboardId: id, output: composedUrl })
    return success(c, { id, composed_video_url: composedUrl })
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error, 'Compose failed')
    logTaskError('ComposeAPI', 'single-compose', { storyboardId: id, error: message })
    return badRequest(c, message)
  }
})

// POST /chapters/:id/compose-all — 批量合成全部镜头
app.post('/chapters/:id/compose-all', async (c) => {
  const chapterId = Number(c.req.param('id'))
  const storyboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, chapterId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all())

  if (storyboards.length === 0) return badRequest(c, 'No storyboards found')

  const withVideo = storyboards.filter(sb => sb.videoUrl)
  if (withVideo.length === 0) return badRequest(c, 'No storyboards have video yet')

  // 异步处理
  await db.update(schema.storyboards)
    .set({ status: 'compose_processing' })
    .where(eq(schema.storyboards.episodeId, chapterId))
    .run()

  ;(async () => {
    for (const sb of withVideo) {
      try {
        await composeStoryboard(sb.id)
      } catch (error: unknown) {
        const message = errorMessageFromUnknown(error, 'Compose failed')
        logTaskError('ComposeAPI', 'batch-item', { storyboardId: sb.id, episodeId: chapterId, error: message })
      }
    }
    logTaskSuccess('ComposeAPI', 'batch-compose', { episodeId: chapterId, total: withVideo.length })
  })()

  logTaskStart('ComposeAPI', 'batch-compose', { episodeId: chapterId, total: withVideo.length })
  return success(c, {
    message: `Started composing ${withVideo.length} storyboards`,
    total: withVideo.length,
  })
})

// GET /chapters/:id/compose-status — 查询批量合成状态
app.get('/chapters/:id/compose-status', async (c) => {
  const chapterId = Number(c.req.param('id'))
  const storyboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, chapterId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all())

  const withVideo = storyboards.filter(sb => !!sb.videoUrl)
  const completed = withVideo.filter(sb => sb.status === 'compose_completed' && !!sb.composedVideoUrl)
  const failed = withVideo.filter(sb => sb.status === 'compose_failed')
  const processing = withVideo.filter(sb => sb.status === 'compose_processing')
  const idle = withVideo.filter(sb => !sb.status || !String(sb.status).startsWith('compose_'))

  return success(c, {
    total: withVideo.length,
    completed: completed.length,
    failed: failed.length,
    processing: processing.length,
    idle: idle.length,
    items: withVideo.map((sb) => toSnakeCase({
      id: sb.id,
      storyboardNumber: sb.storyboardNumber,
      status: sb.status || 'pending',
      composedVideoUrl: sb.composedVideoUrl,
      errorMsg: sb.status === 'compose_failed' ? '视频合成失败，请检查镜头视频素材是否可用' : '',
    })),
  })
})

export default app
