import { eq } from 'drizzle-orm'
import path from 'path'
import { fileURLToPath } from 'url'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { resolveStorageRoot } from '../../utils/runtime-paths.js'
import { captureLastFrame, resolveTailFrameOutputPath } from '../media/frame-capture.js'
import { onResourceCompleted } from './automation-hook.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)

export async function captureAndPersistTailFrame(videoGenerationId: number, localPath: string | null | undefined): Promise<void> {
  if (!localPath) return
  if (!localPath.startsWith('static/') && !localPath.startsWith('static\\')) return
  const inputAbs = path.join(STORAGE_ROOT, '..', localPath)
  const outputAbs = resolveTailFrameOutputPath(videoGenerationId, STORAGE_ROOT)
  await captureLastFrame(inputAbs, outputAbs)
  const publicUrl = `/static/tail-frames/${videoGenerationId}.png`
  await db.update(schema.videoGenerations)
    .set({ tailFrameUrl: publicUrl, updatedAt: now() })
    .where(eq(schema.videoGenerations.id, videoGenerationId))
}

export async function notifyAutomationAfterVideo(
  videoGenerationId: number,
  storyboardId: number | null | undefined,
  status: 'ok' | 'failed',
): Promise<void> {
  try {
    await onResourceCompleted({
      type: 'video',
      storyboardId: storyboardId ?? null,
      videoGenerationId,
      status,
    })
  } catch (err) {
    console.warn('[automation] video hook failed', err)
  }
}
