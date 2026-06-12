import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { ffmpeg, ffmpegSupportsXfade, getVideoStreamInfo } from '../ffmpeg/ffmpeg.js'
import {
  type FfmpegMergeStrategy,
  ffmpegMergeOutputOptions,
  ffmpegMergeStrategies,
  ffmpegXfadeIntermediateOutputOptions,
  resolveFfmpegMergeTimeoutMs,
  resolveStrategyChain,
  resolveXfadeGroupSize,
} from './merge-ffmpeg-strategy.js'
import {
  buildXfadeFilter,
  computeSeamDurations,
  isAnyTransitionEnabled,
  pickXfadeFps,
  planXfadeMergeTree,
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
  /** Per-seam transition configs (clipCount - 1 entries, defaults already resolved) */
  seamTransitions?: TransitionConfig[]
  /** Invoked when xfade is skipped or fails, with the degradation reason */
  onXfadeFallback?: (reason: string) => void
}

export type RunFfmpegConcatInput = RunFfmpegMergeStrategiesInput & {
  strategy: FfmpegMergeStrategy
}

export type RunFfmpegMergeStrategiesDeps = {
  outputExists: (outputPath: string) => boolean
  removeOutput: (outputPath: string) => void
  runConcat: (input: RunFfmpegConcatInput) => Promise<void>
  logWarn: (taskName: string, event: string, payload: Record<string, unknown>) => void
  supportsXfade?: () => Promise<boolean>
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function resolveStrategiesForInput(input: RunFfmpegMergeStrategiesInput): readonly FfmpegMergeStrategy[] {
  const canXfade =
    Array.isArray(input.seamTransitions) &&
    input.seamTransitions.length === input.clipCount - 1 &&
    Array.isArray(input.clipPaths) &&
    input.clipPaths.length === input.clipCount &&
    isAnyTransitionEnabled(input.seamTransitions, input.clipCount)
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
  let strategies = resolveStrategiesForInput(input)

  if (strategies.includes('xfade')) {
    const supportsXfade = await (deps.supportsXfade ?? ffmpegSupportsXfade)()
    if (!supportsXfade) {
      deps.logWarn('MergeTask', 'ffmpeg-xfade-unsupported', {
        mergeId: input.mergeId,
        episodeId: input.episodeId,
      })
      input.onXfadeFallback?.('xfade filter unavailable in ffmpeg')
      strategies = ffmpegMergeStrategies
    }
  }

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
        input.onXfadeFallback?.(lastError.message)
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
  if (
    !input.seamTransitions ||
    input.seamTransitions.length !== input.clipCount - 1 ||
    !input.clipPaths ||
    input.clipPaths.length !== input.clipCount
  ) {
    throw new Error('xfade strategy requires per-seam transition configs and clipPaths')
  }

  const startedAt = Date.now()

  const clipInfos = await Promise.all(input.clipPaths.map(getVideoStreamInfo))
  const clipDurations = clipInfos.map(info => info?.durationSeconds ?? 0)
  if (clipDurations.some(duration => !(duration > 0))) {
    throw new Error('xfade strategy requires positive duration for every clip')
  }
  const fps = pickXfadeFps(clipInfos.map(info => info?.frameRate))

  const { seamDurations } = computeSeamDurations(
    clipDurations,
    input.seamTransitions.map(seam => seam.durationMs),
  )
  if (seamDurations.every(seam => seam <= 0)) {
    throw new Error('xfade not applicable: no valid seams (clips too short)')
  }

  const groupSize = resolveXfadeGroupSize()
  const plan = planXfadeMergeTree(input.clipCount, groupSize)

  logTaskStart('MergeTask', 'ffmpeg-xfade', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    clips: input.clipCount,
    fps,
    groupSize,
    stages: plan.length,
    seamTransitions: input.seamTransitions.map(seam => `${seam.type}:${seam.durationMs}`),
    clipDurations: clipDurations.map(value => Math.round(value * 1000) / 1000),
  })

  const nodePaths = [...input.clipPaths]
  const nodeDurations = [...clipDurations]
  const tempDir = path.dirname(input.listPath)
  const tempFiles = new Set<string>()

  const removeTempFile = (filePath: string) => {
    if (!tempFiles.has(filePath)) return
    tempFiles.delete(filePath)
    try { fs.unlinkSync(filePath) } catch { /* best effort */ }
  }

  try {
    for (let stageIndex = 0; stageIndex < plan.length; stageIndex++) {
      const step = plan[stageIndex]
      const isFinal = stageIndex === plan.length - 1
      const stepOutputPath = isFinal ? input.outputPath : path.join(tempDir, `${uuid()}.xfade.mp4`)

      const built = buildXfadeFilter(
        step.inputNodes.map(id => nodeDurations[id]),
        step.seamIndices.map(index => input.seamTransitions![index]),
        step.inputNodes.map((_, position) => `[${position}:a]`),
        fps,
        { emitWhenAllSeamsZero: true },
      )
      if (!built) {
        throw new Error(`xfade plan stage ${stageIndex + 1}/${plan.length} produced no filter`)
      }

      await runXfadeGraph({
        mergeId: input.mergeId,
        episodeId: input.episodeId,
        stage: `${stageIndex + 1}/${plan.length}`,
        inputPaths: step.inputNodes.map(id => nodePaths[id]),
        filter: built.filter,
        videoOutLabel: built.videoOutLabel,
        audioOutLabel: built.audioOutLabel,
        outputOptions: isFinal ? ffmpegMergeOutputOptions('xfade') : ffmpegXfadeIntermediateOutputOptions(),
        outputPath: stepOutputPath,
      })

      if (!isFinal) {
        tempFiles.add(stepOutputPath)
        const intermediateInfo = await getVideoStreamInfo(stepOutputPath)
        const intermediateDuration = intermediateInfo?.durationSeconds ?? 0
        if (!(intermediateDuration > 0)) {
          throw new Error(`xfade intermediate has invalid duration (stage ${stageIndex + 1}/${plan.length})`)
        }
        nodePaths[step.outputNode] = stepOutputPath
        nodeDurations[step.outputNode] = intermediateDuration
      }

      for (const id of step.inputNodes) {
        removeTempFile(nodePaths[id])
      }
    }
  } finally {
    for (const filePath of [...tempFiles]) {
      removeTempFile(filePath)
    }
  }

  logTaskSuccess('MergeTask', 'ffmpeg-xfade', {
    mergeId: input.mergeId,
    episodeId: input.episodeId,
    clips: input.clipCount,
    fps,
    stages: plan.length,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
}

type RunXfadeGraphInput = {
  mergeId: number
  episodeId: number
  stage: string
  inputPaths: string[]
  filter: string
  videoOutLabel: string
  audioOutLabel: string
  outputOptions: string[]
  outputPath: string
}

async function runXfadeGraph(input: RunXfadeGraphInput) {
  const timeoutMs = resolveFfmpegMergeTimeoutMs()
  const startedAt = Date.now()
  let lastProgressAt = 0
  let stderrTail = ''

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()

    for (const inputPath of input.inputPaths) {
      command.input(inputPath)
    }

    command
      .complexFilter(input.filter)
      .outputOptions([
        '-map', `[${input.videoOutLabel}]`,
        '-map', `[${input.audioOutLabel}]`,
        ...input.outputOptions,
      ])
      .output(input.outputPath)

    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) {
        if (stderrTail) error.message = `${error.message}\nffmpeg stderr tail:\n${stderrTail}`
        reject(error)
      } else resolve()
    }

    const timeout = setTimeout(() => {
      command.kill('SIGKILL')
      finish(new Error(`FFmpeg xfade stage ${input.stage} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    command
      .on('stderr', line => {
        stderrTail = `${stderrTail}${line}\n`.slice(-4000)
      })
      .on('progress', progress => {
        const nowMs = Date.now()
        if (nowMs - lastProgressAt < MERGE_PROGRESS_LOG_INTERVAL_MS) return
        lastProgressAt = nowMs
        logTaskProgress('MergeTask', 'ffmpeg-progress', {
          mergeId: input.mergeId,
          episodeId: input.episodeId,
          strategy: 'xfade',
          stage: input.stage,
          percent: typeof progress.percent === 'number' ? Math.round(progress.percent * 10) / 10 : undefined,
          timemark: progress.timemark,
          elapsedSeconds: Math.round((nowMs - startedAt) / 1000),
        })
      })
      .on('end', () => finish())
      .on('error', err => finish(err))
      .run()
  })
}
