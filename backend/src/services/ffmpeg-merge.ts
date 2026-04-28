/**
 * FFmpeg 多镜头拼接 — 将所有合成后的镜头视频拼接为一集
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../utils/runtime-paths.js'
import { escapeConcatPath, ffmpeg, getVideoDuration } from './ffmpeg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function removeManagedFile(fileUrl: string | null | undefined) {
  if (!fileUrl) return
  const filePath = toAbsPath(fileUrl)
  const resolved = path.resolve(filePath)
  const allowedRoots = [path.resolve(DATA_ROOT), path.resolve(STORAGE_ROOT)]
  if (!allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`))) return
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
  } catch (error) {
    console.warn(`[Merge] Failed to remove previous file: ${resolved}`, error)
  }
}

async function clearPreviousEpisodeMerge(episodeId: number) {
  const previousMerges = (await db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all())

  previousMerges.forEach(merge => removeManagedFile(merge.mergedUrl))

  await db.update(schema.videoMerges)
    .set({ status: 'replaced', mergedUrl: null, deletedAt: now() })
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .run()

  await db.update(schema.episodes)
    .set({ videoUrl: null, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()
}

/**
 * 拼接一集的所有合成镜头视频
 */
export async function mergeEpisodeVideos(episodeId: number, dramaId: number): Promise<number> {
  const storyboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all())

  const composedStoryboards = storyboards.filter(sb => !!sb.composedVideoUrl)
  const videos = composedStoryboards
    .map(sb => sb.composedVideoUrl)
    .filter(Boolean) as string[]

  if (videos.length === 0) throw new Error('No composed videos to merge')

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length })

  clearPreviousEpisodeMerge(episodeId)

  // 创建 merge 记录
  const ts = now()
  const res = (await db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(composedStoryboards.map(sb => ({
      storyboardId: sb.id,
      storyboardNumber: sb.storyboardNumber,
      videoUrl: sb.composedVideoUrl,
    }))),
    createdAt: ts,
  }).run())
  const mergeId = Number(res.lastInsertRowid)

  // 异步执行
  doMerge(mergeId, episodeId, videos).catch(async err => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    await db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
  })

  return mergeId
}

async function doMerge(mergeId: number, episodeId: number, videos: string[]) {
  // 生成 concat 列表文件
  const listDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(listDir, { recursive: true })
  const listPath = path.join(listDir, `${uuid()}.txt`)

  const listContent = videos
    .map(v => `file '${escapeConcatPath(toAbsPath(v))}'`)
    .join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  // 输出文件
  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-fflags', '+genpts',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }

  // 获取时长
  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`

  // 更新 merge 记录
  await db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId)).run()

  // 更新 episode
  await db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length })
}

