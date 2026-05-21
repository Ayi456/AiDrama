import fs from 'fs'
import { ffmpeg, getVideoDurationPrecise } from '../ffmpeg/ffmpeg.js'
import {
  type FfmpegMergeStrategy,
  ffmpegMergeOutputOptions,
  ffmpegMergeStrategies,
  resolveFfmpegMergeTimeoutMs,
  resolveStrategyChain,
} from './merge-ffmpeg-strategy.js'
import {
  buildXfadeFilter,
  isTransitionEnabled,
  type TransitionConfig,
} from './merge-transition-policy.js'
import { logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../../utils/task-logger.js'

const MERGE_PROGRESS_LOG_INTERVAL_MS = 15_000

export type RunFfmpegMergeStrategiesInput = {
  mergeId: number
  episodeId: number
  listPath: string
  outputPath: string
  clipCount: number
  /** Source clip absolute paths (only required for xfade) */
  clipPaths?: string[]
  /** Effective transition config (defaults already resolved) */
  transition?: TransitionConfig
}

export type RunFfmpegConcatInput = RunFfmpegMergeStrategiesInput & {
  strategy: FfmpegMergeStrategy
}

export type RunFfmpegMergeStrategiesDeps = {
  outputExists: (outputPath: string) => boolean
  removeOutput: (outputPath: string) => void
  runConcat: (input: RunFfmpegConcatInput) => Promise<void>
  logWarn: (taskName: string, event: string, payload: Record<string, unknown>) => void
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function resolveStrategiesForInput(input: RunFfmpegMergeStrategiesInput): readonly FfmpegMergeStrategy[] {
  const canXfade =
    !!input.transition &&
    Array.isArray(input.clipPaths) &&
    input.clipPaths.length === input.clipCount &&
    isTransitionEnabled(input.transition, input.clipCount)
  return canXfade ? resolveStrategyChain(true) : ffmpegMergeStrategies
}

export async function runFfmpegMergeStrategies(
  input: RunFfmpegMergeStrategiesInput,
  deps: RunFfmpegMergeStrategiesDeps = {
    outputExists: fs.existsSync,
    removeOutput: fs.unlinkSync,
    runConcat: runFfmpegConcat,
    logWarn: logTaskWarn,
  },
) {
  let lastError: Error | null = null
  const strategies = resolveStrategiesForInput(input)

  for (const strategy of strategies) {
    if (deps.outputExists(input.outputPath)) deps.removeOutput(input.outputPath)

    try {
      await deps.runConcat({ ...input, strategy })
      return strategy
    } catch (error) {
      lastError = normalizeError(error)
      if (strategy === 'xfade') {
        deps.logWarn('MergeTask', 'ffmpeg-xfade-fallback', {
          mergeId: input.mergeId,
          episodeId: input.episodeId,
          reason: lastError.message,
        })
        continue
      }
      if (strategy === 'copy') {
        deps.logWarn('MergeTask', 'ffmpeg-copy-fallback', {
          mergeId: input.mergeId,
          episodeId: input.episodeId,
          reason: lastError.message,
        })
        continue
      }
      break
    }
  }

  throw lastError || new Error('FFmpeg merge failed')
}

export async function runFfmpegConcat(input: RunFfmpegConcatInput) {
  if (input.strategy === 'xfade') {
    return runFfmpegXfade(input)
  }
  return runFfmpegConcatDemuxer(input)
}

async function runFfmpegConcatDemuxer(input: RunFfmpegConcatInput) {
  const timeoutMs = resolveFfmpegMergeTimeoutMs()
  const startedAt = Date.now()
  let lastProgressAt = 0

  logTaskStart('MergeTask', 'ffmpeg-concat', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    strategy: input.strategy,
    clips: input.clipCount,
    timeoutSeconds: Math.round(timeoutMs / 1000),
  })

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(input.listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(ffmpegMergeOutputOptions(input.strategy))
      .output(input.outputPath)

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
      finish(new Error(`FFmpeg ${input.strategy} merge timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    command
      .on('progress', progress => {
        const nowMs = Date.now()
        if (nowMs - lastProgressAt < MERGE_PROGRESS_LOG_INTERVAL_MS) return
        lastProgressAt = nowMs
        logTaskProgress('MergeTask', 'ffmpeg-progress', {
          mergeId: input.mergeId,
          episodeId: input.episodeId,
          strategy: input.strategy,
          percent: typeof progress.percent === 'number' ? Math.round(progress.percent * 10) / 10 : undefined,
          timemark: progress.timemark,
          elapsedSeconds: Math.round((nowMs - startedAt) / 1000),
        })
      })
      .on('end', () => finish())
      .on('error', err => finish(err))
      .run()
  })

  logTaskSuccess('MergeTask', 'ffmpeg-concat', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    strategy: input.strategy,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
}

async function runFfmpegXfade(input: RunFfmpegConcatInput) {
  if (!input.transition || !input.clipPaths || input.clipPaths.length !== input.clipCount) {
    throw new Error('xfade strategy requires transition config and clipPaths')
  }

  const timeoutMs = resolveFfmpegMergeTimeoutMs()
  const startedAt = Date.now()
  let lastProgressAt = 0

  const clipDurations = await Promise.all(input.clipPaths.map(getVideoDurationPrecise))
  if (clipDurations.some(duration => !(duration > 0))) {
    throw new Error('xfade strategy requires positive duration for every clip')
  }

  const audioLabels = clipDurations.map((_, index) => `[${index}:a]`)

  const built = buildXfadeFilter(
    clipDurations,
    input.transition.type,
    input.transition.durationMs,
    audioLabels,
  )

  if (!built) {
    throw new Error('xfade not applicable: no valid seams (clips too short)')
  }

  logTaskStart('MergeTask', 'ffmpeg-xfade', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    clips: input.clipCount,
    transitionType: input.transition.type,
    transitionDurationMs: input.transition.durationMs,
    timeoutSeconds: Math.round(timeoutMs / 1000),
  })

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()

    for (const clipPath of input.clipPaths!) {
      command.input(clipPath)
    }

    command
      .complexFilter(built.filter)
      .outputOptions([
        '-map', `[${built.videoOutLabel}]`,
        '-map', `[${built.audioOutLabel}]`,
        ...ffmpegMergeOutputOptions('xfade'),
      ])
      .output(input.outputPath)

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
      finish(new Error(`FFmpeg xfade merge timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    command
      .on('progress', progress => {
        const nowMs = Date.now()
        if (nowMs - lastProgressAt < MERGE_PROGRESS_LOG_INTERVAL_MS) return
        lastProgressAt = nowMs
        logTaskProgress('MergeTask', 'ffmpeg-progress', {
          mergeId: input.mergeId,
          episodeId: input.episodeId,
          strategy: 'xfade',
          percent: typeof progress.percent === 'number' ? Math.round(progress.percent * 10) / 10 : undefined,
          timemark: progress.timemark,
          elapsedSeconds: Math.round((nowMs - startedAt) / 1000),
        })
      })
      .on('end', () => finish())
      .on('error', err => finish(err))
      .run()
  })

  logTaskSuccess('MergeTask', 'ffmpeg-xfade', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    clips: input.clipCount,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
}
