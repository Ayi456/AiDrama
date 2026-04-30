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
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../utils/runtime-paths.js'
import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../utils/cos.js'
import { escapeConcatPath, ffmpeg, FFMPEG_PATH, FFPROBE_PATH, getVideoDuration } from './ffmpeg.js'
import { ensureMergeInputFiles } from './merge-inputs.js'
import { selectMergeClipStoryboards } from './merge-clips.js'
import {
  type FfmpegMergeStrategy,
  ffmpegMergeOutputOptions,
  ffmpegMergeStrategies,
  resolveFfmpegMergeTimeoutMs,
} from './merge-ffmpeg-strategy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)
const MERGE_PROGRESS_LOG_INTERVAL_MS = 15_000

function toAbsPath(relativePath: string): string {
  return staticAssetToLocalPath(relativePath, DATA_ROOT, STORAGE_ROOT)
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

type MergeEpisodeVideoOptions = {
  storyboardIds?: number[]
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
export async function mergeEpisodeVideos(episodeId: number, dramaId: number, options: MergeEpisodeVideoOptions = {}): Promise<number> {
  const storyboards = (await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all())

  const mergeStoryboards = selectMergeClipStoryboards(storyboards, options.storyboardIds)
  const videos = mergeStoryboards.map(sb => sb.mergeVideoUrl)

  if (videos.length === 0) throw new Error(options.storyboardIds ? 'No selected videos to merge' : 'No videos to merge')

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length, storyboardIds: options.storyboardIds, ffmpegPath: FFMPEG_PATH, ffprobePath: FFPROBE_PATH })

  await clearPreviousEpisodeMerge(episodeId)

  // 创建 merge 记录
  const ts = now()
  const res = (await db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-copy-fallback-transcode',
    status: 'processing',
    scenes: JSON.stringify(mergeStoryboards.map(sb => ({
      storyboardId: sb.id,
      storyboardNumber: sb.storyboardNumber,
      videoUrl: sb.mergeVideoUrl,
      source: sb.videoUrl ? 'storyboard' : 'composed',
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

  const mergeInputs = videos.map(sourceUrl => ({
    sourceUrl,
    localPath: toAbsPath(sourceUrl),
  }))
  const missingInputs = mergeInputs.filter(input => input.localPath && !fs.existsSync(input.localPath))
  const restoreStartedAt = Date.now()
  logTaskProgress('MergeTask', 'merge-inputs-restore-start', {
    mergeId,
    episodeId,
    clips: videos.length,
    missing: missingInputs.length,
  })
  const inputFiles = await ensureMergeInputFiles(mergeInputs)
  logTaskSuccess('MergeTask', 'merge-inputs-ready', {
    mergeId,
    episodeId,
    clips: videos.length,
    restored: missingInputs.length,
    elapsedSeconds: Math.round((Date.now() - restoreStartedAt) / 1000),
  })
  const listContent = inputFiles
    .map(filePath => `file '${escapeConcatPath(filePath)}'`)
    .join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  // 输出文件
  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  let strategy: FfmpegMergeStrategy = 'copy'
  try {
    strategy = await runMergeStrategies(mergeId, episodeId, listPath, outputPath, videos.length)
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }

  // 获取时长
  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`
  const mergedUrl = await uploadStaticAssetToCos(mergedRelative, outputPath) || mergedRelative

  // 更新 merge 记录
  await db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId)).run()

  // 更新 episode
  await db.update(schema.episodes)
    .set({ videoUrl: mergedUrl, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedUrl, localPath: mergedRelative, duration, clips: videos.length, strategy })
}

async function runMergeStrategies(
  mergeId: number,
  episodeId: number,
  listPath: string,
  outputPath: string,
  clipCount: number,
) {
  let lastError: Error | null = null

  for (const strategy of ffmpegMergeStrategies) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    try {
      await runFfmpegConcat(mergeId, episodeId, listPath, outputPath, clipCount, strategy)
      return strategy
    } catch (error) {
      lastError = error as Error
      if (strategy === 'copy') {
        logTaskWarn('MergeTask', 'ffmpeg-copy-fallback', {
          mergeId,
          episodeId,
          reason: lastError.message,
        })
        continue
      }
      break
    }
  }

  throw lastError || new Error('FFmpeg merge failed')
}

async function runFfmpegConcat(
  mergeId: number,
  episodeId: number,
  listPath: string,
  outputPath: string,
  clipCount: number,
  strategy: FfmpegMergeStrategy,
) {
  const timeoutMs = resolveFfmpegMergeTimeoutMs()
  const startedAt = Date.now()
  let lastProgressAt = 0

  logTaskStart('MergeTask', 'ffmpeg-concat', {
    mergeId,
    episodeId,
    strategy,
    clips: clipCount,
    timeoutSeconds: Math.round(timeoutMs / 1000),
  })

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(ffmpegMergeOutputOptions(strategy))
      .output(outputPath)

    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }

    const timeout = setTimeout(() => {
      command.kill('SIGKILL')
      finish(new Error(`FFmpeg ${strategy} merge timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    command
      .on('progress', progress => {
        const nowMs = Date.now()
        if (nowMs - lastProgressAt < MERGE_PROGRESS_LOG_INTERVAL_MS) return
        lastProgressAt = nowMs
        logTaskProgress('MergeTask', 'ffmpeg-progress', {
          mergeId,
          episodeId,
          strategy,
          percent: typeof progress.percent === 'number' ? Math.round(progress.percent * 10) / 10 : undefined,
          timemark: progress.timemark,
          elapsedSeconds: Math.round((nowMs - startedAt) / 1000),
        })
      })
      .on('end', () => finish())
      .on('error', (err) => finish(err))
      .run()
  })

  logTaskSuccess('MergeTask', 'ffmpeg-concat', {
    mergeId,
    episodeId,
    strategy,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
}

