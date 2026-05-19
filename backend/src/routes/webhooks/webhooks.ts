/**
 * Vidu webhook callbacks for async video generation results.
 */
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { success, badRequest, now } from '../../utils/response.js'
import { downloadFile } from '../../utils/storage.js'
import { uploadStaticAssetToCos } from '../../utils/cos.js'
import { completeViduWebhookVideo } from '../../services/webhooks/vidu-webhook-completion.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../../utils/task-logger.js'

const app = new Hono()

// POST /webhooks/vidu
// Vidu callback payload: { task_id, state, video_url, ... }
app.post('/vidu', async (c) => {
  const body = await c.req.json()
  const { task_id, state, video_url, error } = body
  logTaskProgress('Webhook', 'vidu-callback', {
    taskId: task_id,
    state,
    hasVideoUrl: !!video_url,
    error,
  })

  if (!task_id) {
    logTaskWarn('Webhook', 'vidu-callback-missing-task-id', { state })
    return badRequest(c, 'Missing task_id')
  }

  const rows = (await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.taskId, task_id))
    .all())

  if (rows.length === 0) {
    logTaskWarn('Webhook', 'vidu-task-not-found', { taskId: task_id })
    return success(c, { message: 'Task not found' })
  }

  const record = rows[0]

  if (state === 'success' && video_url) {
    try {
      await completeViduWebhookVideo({
        taskId: task_id,
        record,
        videoUrl: video_url,
      }, {
        now,
        downloadFile,
        uploadGeneratedAsset: uploadStaticAssetToCos,
        persistVideoCompletion: async (patch) => {
          await db.update(schema.videoGenerations)
            .set(patch)
            .where(eq(schema.videoGenerations.id, record.id))
            .run()
        },
        publishStoryboardVideo: async (storyboardId, patch) => {
          await db.update(schema.storyboards)
            .set(patch)
            .where(eq(schema.storyboards.id, storyboardId))
            .run()
        },
        logSuccess: logTaskSuccess,
      })
      return success(c, { message: 'Video updated successfully' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logTaskError('Webhook', 'vidu-download-failed', { taskId: task_id, generationId: record.id, error: message })
      await db.update(schema.videoGenerations)
        .set({ status: 'failed', errorMsg: `Webhook download failed: ${message}` })
        .where(eq(schema.videoGenerations.id, record.id))
        .run()
      return badRequest(c, message)
    }
  }

  if (state === 'failed') {
    logTaskError('Webhook', 'vidu-generation-failed', { taskId: task_id, generationId: record.id, error: error || 'Vidu generation failed' })
    await db.update(schema.videoGenerations)
      .set({
        status: 'failed',
        errorMsg: error || 'Vidu generation failed',
      })
      .where(eq(schema.videoGenerations.id, record.id))
      .run()
    return success(c, { message: 'Error recorded' })
  }

  logTaskProgress('Webhook', 'vidu-status-noted', { taskId: task_id, generationId: record.id, state })
  return success(c, { message: 'Status noted' })
})

export default app
