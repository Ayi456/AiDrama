export const ffmpegMergeStrategies = ['copy', 'transcode'] as const
export const ffmpegMergeStrategiesWithXfade = ['xfade', 'transcode', 'copy'] as const

export type FfmpegMergeStrategy = typeof ffmpegMergeStrategiesWithXfade[number]

const DEFAULT_FFMPEG_MERGE_TIMEOUT_MS = 14 * 60 * 1000

export function resolveFfmpegMergeTimeoutMs(rawValue = process.env.MERGE_FFMPEG_TIMEOUT_MS) {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_FFMPEG_MERGE_TIMEOUT_MS
}

const DEFAULT_XFADE_GROUP_SIZE = 4
const MIN_XFADE_GROUP_SIZE = 2
const MAX_XFADE_GROUP_SIZE = 6

/** Max inputs per xfade ffmpeg run; bounds peak memory (~100MB per input + encoder). */
export function resolveXfadeGroupSize(rawValue = process.env.MERGE_XFADE_GROUP_SIZE) {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return DEFAULT_XFADE_GROUP_SIZE
  return Math.min(MAX_XFADE_GROUP_SIZE, Math.max(MIN_XFADE_GROUP_SIZE, Math.round(parsed)))
}

/** Intermediate tree-merge outputs: near-lossless to limit generation loss, no faststart remux. */
export function ffmpegXfadeIntermediateOutputOptions() {
  return [
    '-fflags', '+genpts',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-b:a', '192k',
  ]
}

export function ffmpegMergeOutputOptions(strategy: FfmpegMergeStrategy) {
  if (strategy === 'copy') {
    return [
      '-fflags', '+genpts',
      '-c', 'copy',
      '-movflags', '+faststart',
    ]
  }

  // xfade and transcode share the same encode params
  return [
    '-fflags', '+genpts',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-b:a', '192k',
    '-movflags', '+faststart',
  ]
}

export function resolveStrategyChain(transitionEnabled: boolean): readonly FfmpegMergeStrategy[] {
  return transitionEnabled ? ffmpegMergeStrategiesWithXfade : ffmpegMergeStrategies
}
