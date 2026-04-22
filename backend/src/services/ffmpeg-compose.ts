/**
 * FFmpeg 单镜头合成：纯视频标准化输出
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

/**
 * 合成单个镜头：仅输出标准化视频，不再生成音频或字幕。
 */
export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!storyboard.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)

  db.update(schema.storyboards)
    .set({ status: 'compose_processing', composedVideoUrl: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: storyboard.storyboardNumber,
    episodeId: storyboard.episodeId,
    mode: 'video-only',
  })

  const videoPath = toAbsPath(storyboard.videoUrl)
  if (!fs.existsSync(videoPath)) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw new Error(`Storyboard ${storyboardId} video file not found`)
  }

  const outputDir = path.join(STORAGE_ROOT, 'composed')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-map', '0:v:0',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const composedRelative = `static/composed/${outputFilename}`
    db.update(schema.storyboards)
      .set({ composedVideoUrl: composedRelative, status: 'compose_completed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: storyboard.storyboardNumber,
      output: composedRelative,
      mode: 'video-only',
    })

    return composedRelative
  } catch (error) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw error
  }
}
