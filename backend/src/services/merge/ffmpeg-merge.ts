import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../../utils/runtime-paths.js'
import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../../utils/cos.js'
import { escapeConcatPath, FFMPEG_PATH, FFPROBE_PATH, getVideoDuration } from '../ffmpeg/ffmpeg.js'
import { ensureMergeInputFiles } from './merge-inputs.js'
import { selectMergeClipStoryboards } from './merge-clips.js'
import { createMergeJobDbPersistence, normalizeMergeErrorMessage } from './merge-job-state.js'
import { runFfmpegMergeStrategies } from './merge-ffmpeg-execution.js'
import {
  isAnyTransitionEnabled,
  resolveSeamTransitions,
  resolveTransitionConfig,
  type TransitionConfig,
} from './merge-transition-policy.js'
import { db, schema } from '../../db/index.js'
import { onMergeCompleted } from '../automation/automation-hook.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../../..')
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)
type MergeEpisodeVideoOptions = {
  storyboardIds?: number[]
}

type MergeJobPersistence = ReturnType<typeof createMergeJobDbPersistence>

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

async function clearPreviousEpisodeMerge(episodeId: number, mergeState: MergeJobPersistence) {
  const previousMerges = await mergeState.loadPreviousEpisodeMerges(episodeId)
  previousMerges.forEach(merge => removeManagedFile(merge.mergedUrl))

  await mergeState.replaceEpisodeMerges(episodeId, now())
  await mergeState.clearEpisodeVideo(episodeId, now())
}

export async function mergeEpisodeVideos(
  episodeId: number,
  dramaId: number,
  options: MergeEpisodeVideoOptions = {},
): Promise<number> {
  const mergeState = createMergeJobDbPersistence()
  const storyboards = await mergeState.loadEpisodeStoryboards(episodeId)
  const mergeStoryboards = selectMergeClipStoryboards(storyboards, options.storyboardIds)
  const videos = mergeStoryboards.map(storyboard => storyboard.mergeVideoUrl)

  if (videos.length === 0) {
    throw new Error(options.storyboardIds ? 'No selected videos to merge' : 'No videos to merge')
  }

  const [episodeRow] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const globalTransition = resolveTransitionConfig({
    type: episodeRow?.transitionType ?? null,
    durationMs: episodeRow?.transitionDurationMs ?? null,
  })
  // One seam per adjacent clip pair (clipCount - 1). Each seam inherits the episode default
  // unless that clip carries its own override (the transition into the next clip).
  const seamOverrides = mergeStoryboards.slice(0, -1).map(storyboard => ({
    type: storyboard.transitionType ?? null,
    durationMs: storyboard.transitionDurationMs ?? null,
  }))
  const seamTransitions = resolveSeamTransitions(globalTransition, seamOverrides)
  const transitionsEnabled = isAnyTransitionEnabled(seamTransitions, videos.length)
  const seamTransitionsForMerge = transitionsEnabled ? seamTransitions : null
  const transitionForSnapshot = transitionsEnabled ? globalTransition : null

  logTaskStart('MergeTask', 'episode-merge', {
    episodeId,
    dramaId,
    clips: videos.length,
    storyboardIds: options.storyboardIds,
    ffmpegPath: FFMPEG_PATH,
    ffprobePath: FFPROBE_PATH,
    transitionEnabled: transitionsEnabled,
    seamTransitions: seamTransitionsForMerge?.map(seam => `${seam.type}:${seam.durationMs}`) ?? null,
  })

  await clearPreviousEpisodeMerge(episodeId, mergeState)

  const createdAt = now()
  const mergeId = await mergeState.createEpisodeMergeRecord({
    episodeId,
    dramaId,
    storyboards: mergeStoryboards,
    createdAt,
    transition: transitionForSnapshot,
  })

  doMerge(mergeId, episodeId, videos, mergeState, seamTransitionsForMerge).catch(async (error: unknown) => {
    const message = normalizeMergeErrorMessage(error)
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: message })
    console.error('[Merge] Failed:', error)
    await mergeState.recordMergeFailure(mergeId, error)
    await onMergeCompleted({ episodeId, status: 'failed' }).catch(err => console.warn('[automation] merge failure hook failed', err))
  })

  return mergeId
}

async function doMerge(
  mergeId: number,
  episodeId: number,
  videos: string[],
  mergeState: MergeJobPersistence,
  seamTransitions: TransitionConfig[] | null,
) {
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

  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  let strategy = 'copy'
  try {
    strategy = await runFfmpegMergeStrategies({
      mergeId,
      episodeId,
      listPath,
      outputPath,
      clipCount: videos.length,
      clipPaths: inputFiles,
      seamTransitions: seamTransitions ?? undefined,
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }

  const duration = await getVideoDuration(outputPath)
  const mergedRelative = `static/merged/${outputFilename}`
  const mergedUrl = await uploadStaticAssetToCos(mergedRelative, outputPath) || mergedRelative

  await mergeState.completeEpisodeMerge({
    mergeId,
    episodeId,
    mergedUrl,
    duration,
    completedAt: now(),
    episodeUpdatedAt: now(),
  })

  logTaskSuccess('MergeTask', 'episode-merge', {
    mergeId,
    episodeId,
    output: mergedUrl,
    localPath: mergedRelative,
    duration,
    clips: videos.length,
    strategy,
  })
  await onMergeCompleted({ episodeId, status: 'ok' }).catch(err => console.warn('[automation] merge hook failed', err))
}
