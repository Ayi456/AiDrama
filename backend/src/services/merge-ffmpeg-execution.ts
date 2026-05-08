import fs from 'fs'
import { ffmpeg } from './ffmpeg.js'
import {
  type FfmpegMergeStrategy,
  ffmpegMergeOutputOptions,
  ffmpegMergeStrategies,
  resolveFfmpegMergeTimeoutMs,
} from './merge-ffmpeg-strategy.js'
import { logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

const MERGE_PROGRESS_LOG_INTERVAL_MS = 15_000

export type RunFfmpegMergeStrategiesInput = {
  mergeId: number
  episodeId: number
  listPath: string
  outputPath: string
  clipCount: number
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

  for (const strategy of ffmpegMergeStrategies) {
    if (deps.outputExists(input.outputPath)) deps.removeOutput(input.outputPath)

    try {
      await deps.runConcat({ ...input, strategy })
      return strategy
    } catch (error) {
      lastError = normalizeError(error)
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
