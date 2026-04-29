/**
 * FFmpeg 单镜头合成：纯视频标准化输出
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../utils/runtime-paths.js'
import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../utils/cos.js'
import { ffmpeg, hasAudioStream } from './ffmpeg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)

function toAbsPath(relativePath: string): string {
  return staticAssetToLocalPath(relativePath, DATA_ROOT, STORAGE_ROOT)
}

/**
 * 合成单个镜头：仅输出标准化视频，不再生成音频或字幕。
 */
export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [storyboard] = (await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all())
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!storyboard.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)

  await db.update(schema.storyboards)
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
    await db.update(schema.storyboards)
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
    const hasAudio = await hasAudioStream(videoPath)

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(videoPath)

      if (!hasAudio) {
        command.input('anullsrc=channel_layout=stereo:sample_rate=48000')
          .inputOptions(['-f', 'lavfi'])
      }

      command
        .outputOptions([
          '-map', '0:v:0',
          '-map', hasAudio ? '0:a:0' : '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '48000',
          '-shortest',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const composedRelative = `static/composed/${outputFilename}`
    const composedUrl = await uploadStaticAssetToCos(composedRelative, outputPath) || composedRelative
    await db.update(schema.storyboards)
      .set({ composedVideoUrl: composedUrl, status: 'compose_completed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: storyboard.storyboardNumber,
      output: composedUrl,
      localPath: composedRelative,
      mode: 'video-only',
      hasAudio,
    })

    return composedUrl
  } catch (error) {
    await db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw error
  }
}
