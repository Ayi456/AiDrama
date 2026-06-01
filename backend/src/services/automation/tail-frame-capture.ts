import { eq } from 'drizzle-orm'
import path from 'path'
import { fileURLToPath } from 'url'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { resolveDataRoot, resolveStorageRoot } from '../../utils/runtime-paths.js'
import { captureLastFrame, resolveTailFrameOutputPath } from '../media/frame-capture.js'
import { ensureTailFrameInputFile } from './tail-frame-input.js'
import { resolveAutomationProjectRoot } from './tail-frame-path-policy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolveAutomationProjectRoot(__dirname)
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)

export async function captureAndPersistTailFrame(videoGenerationId: number, localPath: string | null | undefined): Promise<string | null> {
  const [video] = (await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, videoGenerationId))
    .all())
  const inputAbs = await ensureTailFrameInputFile({
    source: {
      localPath: localPath || video?.localPath,
      videoUrl: video?.videoUrl,
      minioUrl: video?.minioUrl,
    },
    dataRoot: DATA_ROOT,
    storageRoot: STORAGE_ROOT,
  })
  if (!inputAbs) return null
  const outputAbs = resolveTailFrameOutputPath(videoGenerationId, STORAGE_ROOT)
  await captureLastFrame(inputAbs, outputAbs)
  const publicUrl = `/static/tail-frames/${videoGenerationId}.png`
  await db.update(schema.videoGenerations)
    .set({ tailFrameUrl: publicUrl, updatedAt: now() })
    .where(eq(schema.videoGenerations.id, videoGenerationId))
  if (video?.storyboardId) {
    await db.update(schema.storyboards)
      .set({ lastFrameImage: publicUrl, updatedAt: now() })
      .where(eq(schema.storyboards.id, video.storyboardId))
  }
  return publicUrl
}
