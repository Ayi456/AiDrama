import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../../utils/runtime-paths.js'
import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../../utils/cos.js'
import { escapeConcatPath, FFMPEG_PATH, FFPROBE_PATH, getVideoDuration } from '../ffmpeg/ffmpeg.js'
import { ensureMergeInputFiles } from './merge-inputs.js'
import { selectMergeClipStoryboards } from './merge-clips.js'
import {
  createMergeJobDbPersistence,
  MERGE_CLAIM_HEARTBEAT_MS,
  normalizeMergeErrorMessage,
  type EpisodeStoryboardRecord,
  type MergeStoryboardForRecord,
} from './merge-job-state.js'
import { runFfmpegConcat, runFfmpegMergeStrategies, type RunFfmpegConcatInput } from './merge-ffmpeg-execution.js'
import { normalizeMergeInputFiles, resolveMergeClipNormalizationMode } from './merge-normalization.js'
import { resolveMergeStoryboardIds } from './merge-status.js'
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
const activeMergeJobs = new Set<number>()

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

function writeConcatList(listPath: string, inputFiles: string[]) {
  const listContent = inputFiles
    .map(filePath => `file '${escapeConcatPath(filePath)}'`)
    .join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')
}

async function clearPreviousEpisodeMerge(episodeId: number, mergeState: MergeJobPersistence) {
  const previousMerges = await mergeState.loadPreviousEpisodeMerges(episodeId)
  previousMerges.forEach(merge => removeManagedFile(merge.mergedUrl))

  await mergeState.replaceEpisodeMerges(episodeId, now())
  await mergeState.clearEpisodeVideo(episodeId, now())
}

async function resolveMergeTransitions(
  episodeId: number,
  mergeStoryboards: Array<MergeStoryboardForRecord & Pick<EpisodeStoryboardRecord, 'transitionType' | 'transitionDurationMs'>>,
) {
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
  const videos = mergeStoryboards.map(storyboard => storyboard.mergeVideoUrl)
  const seamTransitions = resolveSeamTransitions(globalTransition, seamOverrides)
  const transitionsEnabled = isAnyTransitionEnabled(seamTransitions, videos.length)
  return {
    transitionForSnapshot: transitionsEnabled ? globalTransition : null,
    seamTransitionsForMerge: transitionsEnabled ? seamTransitions : null,
    transitionsEnabled,
  }
}

export function isMergeJobRunning(mergeId: number) {
  return activeMergeJobs.has(mergeId)
}

function startMergeJob(
  mergeId: number,
  episodeId: number,
  videos: string[],
  mergeState: MergeJobPersistence,
  seamTransitions: TransitionConfig[] | null,
) {
  if (activeMergeJobs.has(mergeId)) return false
  activeMergeJobs.add(mergeId)
  const heartbeat = setInterval(() => {
    mergeState.touchMergeClaim(mergeId, now()).catch(() => {})
  }, MERGE_CLAIM_HEARTBEAT_MS)
  doMerge(mergeId, episodeId, videos, mergeState, seamTransitions).catch(async (error: unknown) => {
    const message = normalizeMergeErrorMessage(error)
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: message })
    console.error('[Merge] Failed:', error)
    await mergeState.recordMergeFailure(mergeId, error)
    await onMergeCompleted({ episodeId, status: 'failed' }).catch(err => console.warn('[automation] merge failure hook failed', err))
  }).finally(() => {
    clearInterval(heartbeat)
    activeMergeJobs.delete(mergeId)
  })
  return true
}

type RunHardCutMergeInput = Omit<RunFfmpegConcatInput, 'strategy'> & {
  clipPaths: string[]
  sourceUrls: string[]
  mergeInputs: Array<{ sourceUrl: string; localPath: string }>
}

function warnMergeFallback(event: string, input: RunHardCutMergeInput, error: unknown) {
  logTaskWarn('MergeTask', event, {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    reason: normalizeMergeErrorMessage(error),
  })
}

async function runHardCutMerge(input: RunHardCutMergeInput): Promise<string> {
  try {
    await runFfmpegConcat({ ...input, strategy: 'copy' })
    return 'copy'
  } catch (copyError) {
    warnMergeFallback('ffmpeg-copy-normalize-fallback', input, copyError)
  }

  if (resolveMergeClipNormalizationMode() === 'off') {
    await runFfmpegConcat({ ...input, strategy: 'transcode' })
    return 'transcode'
  }

  let normalizedListPath: string | null = null
  try {
    const startedAt = Date.now()
    logTaskProgress('MergeTask', 'normalize-clips-start', {
      mergeId: input.mergeId,
      episodeId: input.episodeId,
      clips: input.clipCount,
    })
    const normalizedClipPaths = await normalizeMergeInputFiles(input.mergeInputs, {
      dataRoot: DATA_ROOT,
      storageRoot: STORAGE_ROOT,
    })
    logTaskSuccess('MergeTask', 'normalize-clips-ready', {
      mergeId: input.mergeId,
      episodeId: input.episodeId,
      clips: input.clipCount,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    })

    normalizedListPath = path.join(path.dirname(input.listPath), `${uuid()}.normalized.txt`)
    writeConcatList(normalizedListPath, normalizedClipPaths)
    try {
      await runFfmpegConcat({
        ...input,
        listPath: normalizedListPath,
        clipPaths: normalizedClipPaths,
        strategy: 'copy',
      })
      return 'normalized-copy'
    } catch (normalizedCopyError) {
      warnMergeFallback('ffmpeg-normalized-copy-fallback', input, normalizedCopyError)
      await runFfmpegConcat({
        ...input,
        listPath: normalizedListPath,
        clipPaths: normalizedClipPaths,
        strategy: 'transcode',
      })
      return 'normalized-transcode'
    }
  } catch (normalizationError) {
    warnMergeFallback('normalize-clips-fallback', input, normalizationError)
    await runFfmpegConcat({ ...input, strategy: 'transcode' })
    return 'transcode'
  } finally {
    if (normalizedListPath && fs.existsSync(normalizedListPath)) fs.unlinkSync(normalizedListPath)
  }
}

export async function ensureMergeJobRunning(mergeId: number): Promise<boolean> {
  if (activeMergeJobs.has(mergeId)) return true

  const [merge] = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.id, mergeId)).all()
  if (!merge || merge.status !== 'processing') return false

  const episodeId = Number(merge.episodeId)
  if (!Number.isFinite(episodeId)) return false

  const mergeState = createMergeJobDbPersistence()
  const storyboards = await mergeState.loadEpisodeStoryboards(episodeId)
  const storyboardIds = resolveMergeStoryboardIds(merge.scenes)
  const mergeStoryboards = selectMergeClipStoryboards(
    storyboards,
    storyboardIds.length ? storyboardIds : undefined,
  )
  const videos = mergeStoryboards.map(storyboard => storyboard.mergeVideoUrl)
  if (videos.length === 0) {
    await mergeState.recordMergeFailure(mergeId, 'No videos to resume merge')
    await onMergeCompleted({ episodeId, status: 'failed' }).catch(err => console.warn('[automation] merge failure hook failed', err))
    return false
  }

  const { seamTransitionsForMerge } = await resolveMergeTransitions(episodeId, mergeStoryboards)
  const claimed = await mergeState.claimMergeJob(mergeId, now())
  if (!claimed) return true

  logTaskProgress('MergeTask', 'resume-processing-merge', {
    mergeId,
    episodeId,
    clips: videos.length,
  })
  return startMergeJob(mergeId, episodeId, videos, mergeState, seamTransitionsForMerge)
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

  const {
    transitionForSnapshot,
    seamTransitionsForMerge,
    transitionsEnabled,
  } = await resolveMergeTransitions(episodeId, mergeStoryboards)

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

  startMergeJob(mergeId, episodeId, videos, mergeState, seamTransitionsForMerge)

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

  writeConcatList(listPath, inputFiles)

  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  let strategy = 'copy'
  try {
    strategy = seamTransitions
      ? await runFfmpegMergeStrategies({
        mergeId,
        episodeId,
        listPath,
        outputPath,
        clipCount: videos.length,
        clipPaths: inputFiles,
        seamTransitions,
        onXfadeFallback: reason => {
          mergeState.recordMergeDiagnostic(mergeId, `xfade-fallback: ${reason}`).catch(() => {})
        },
      })
      : await runHardCutMerge({
        mergeId,
        episodeId,
        listPath,
        outputPath,
        clipCount: videos.length,
        clipPaths: inputFiles,
        sourceUrls: videos,
        mergeInputs,
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
    strategy,
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
