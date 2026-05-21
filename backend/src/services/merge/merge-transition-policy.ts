export const TRANSITION_TYPE_WHITELIST = ['fade', 'fadeblack', 'fadewhite'] as const
export type TransitionType = typeof TRANSITION_TYPE_WHITELIST[number]

export const DEFAULT_TRANSITION_TYPE: TransitionType = 'fade'
export const DEFAULT_TRANSITION_DURATION_MS = 500
export const MAX_TRANSITION_DURATION_MS = 2000
export const MIN_TRANSITION_DURATION_MS = 0

export type TransitionConfig = {
  type: TransitionType
  durationMs: number
}

export function normalizeTransitionType(value: unknown): TransitionType | null {
  if (typeof value !== 'string') return null
  return (TRANSITION_TYPE_WHITELIST as readonly string[]).includes(value)
    ? (value as TransitionType)
    : null
}

export function normalizeTransitionDurationMs(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed < MIN_TRANSITION_DURATION_MS) return MIN_TRANSITION_DURATION_MS
  if (parsed > MAX_TRANSITION_DURATION_MS) return MAX_TRANSITION_DURATION_MS
  return Math.round(parsed)
}

export function resolveTransitionConfig(input: {
  type?: string | null
  durationMs?: number | null
}): TransitionConfig {
  const type = normalizeTransitionType(input.type) ?? DEFAULT_TRANSITION_TYPE
  const durationMs = input.durationMs == null
    ? DEFAULT_TRANSITION_DURATION_MS
    : normalizeTransitionDurationMs(input.durationMs) ?? DEFAULT_TRANSITION_DURATION_MS
  return { type, durationMs }
}

export function isTransitionEnabled(config: TransitionConfig, clipCount: number): boolean {
  return clipCount >= 2 && config.durationMs > 0
}

export type SeamDurations = {
  /** per-seam transition duration in seconds, length = clipCount - 1 */
  seamDurations: number[]
  /** offset (in seconds) for each xfade seam */
  seamOffsets: number[]
}

/** Seams shorter than this are degraded to a hard cut (xfade not perceptible / risky). */
const MIN_SEAM_DURATION_SECONDS = 0.05

/**
 * Per-seam max transition duration: bounded by configured d, and by half of each adjacent clip.
 * If a seam ends up below MIN_SEAM_DURATION_SECONDS (clip too short), it degrades to a hard cut.
 */
export function computeSeamDurations(
  clipDurationsSeconds: number[],
  configDurationMs: number,
): SeamDurations {
  const d = configDurationMs / 1000
  const seamDurations: number[] = []
  const seamOffsets: number[] = []

  let cumulative = 0
  for (let k = 0; k < clipDurationsSeconds.length - 1; k++) {
    const left = clipDurationsSeconds[k]
    const right = clipDurationsSeconds[k + 1]
    const rawSeam = Math.min(d, left / 2, right / 2)
    const seamD = rawSeam < MIN_SEAM_DURATION_SECONDS ? 0 : rawSeam
    cumulative += left
    seamOffsets.push(Math.max(0, cumulative - seamD))
    seamDurations.push(seamD)
    cumulative -= seamD
  }

  return { seamDurations, seamOffsets }
}

/**
 * Build the filter_complex string for xfade + acrossfade.
 * Returns null when there is nothing to transition (clipCount < 2 or all seams degraded to 0).
 *
 * Stream labels:
 *   inputs:  [0:v], [0:a], [1:v], [1:a], ...
 *   outputs: [vout] and [aout]
 *
 * Caller is responsible for input ordering and audio source labels (e.g. anullsrc backfill).
 */
export function buildXfadeFilter(
  clipDurationsSeconds: number[],
  type: TransitionType,
  configDurationMs: number,
  audioLabels: string[],
): { filter: string; videoOutLabel: string; audioOutLabel: string } | null {
  const n = clipDurationsSeconds.length
  if (n < 2) return null
  if (audioLabels.length !== n) {
    throw new Error(`audioLabels length ${audioLabels.length} != clipCount ${n}`)
  }

  const { seamDurations, seamOffsets } = computeSeamDurations(clipDurationsSeconds, configDurationMs)
  if (seamDurations.every(seam => seam <= 0)) return null

  // xfade / acrossfade require all inputs to share fps / pixel format / sample rate / channel layout
  // and start at PTS=0. Normalize every video and audio stream before feeding the transition chain.
  const normSteps: string[] = []
  const normalizedVideoLabels: string[] = []
  const normalizedAudioLabels: string[] = []

  for (let k = 0; k < n; k++) {
    const vLabel = `[v${k}n]`
    const aLabel = `[a${k}n]`
    normSteps.push(`[${k}:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS${vLabel}`)
    normSteps.push(`${audioLabels[k]}aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS${aLabel}`)
    normalizedVideoLabels.push(vLabel)
    normalizedAudioLabels.push(aLabel)
  }

  const videoSteps: string[] = []
  const audioSteps: string[] = []

  let prevV = normalizedVideoLabels[0]
  let prevA = normalizedAudioLabels[0]

  for (let k = 0; k < n - 1; k++) {
    const seamD = seamDurations[k]
    const offset = seamOffsets[k]
    const inputV = normalizedVideoLabels[k + 1]
    const inputA = normalizedAudioLabels[k + 1]
    const vLabel = k === n - 2 ? '[vout]' : `[v${k}]`
    const aLabel = k === n - 2 ? '[aout]' : `[a${k}]`

    if (seamD > 0) {
      videoSteps.push(`${prevV}${inputV}xfade=transition=${type}:duration=${seamD.toFixed(3)}:offset=${offset.toFixed(3)}${vLabel}`)
      audioSteps.push(`${prevA}${inputA}acrossfade=d=${seamD.toFixed(3)}${aLabel}`)
    } else {
      // Hard cut for this seam — use concat filter with n=2 (1 video, 1 audio)
      videoSteps.push(`${prevV}${inputV}concat=n=2:v=1:a=0${vLabel}`)
      audioSteps.push(`${prevA}${inputA}concat=n=2:v=0:a=1${aLabel}`)
    }

    prevV = vLabel
    prevA = aLabel
  }

  return {
    filter: [...normSteps, ...videoSteps, ...audioSteps].join(';'),
    videoOutLabel: 'vout',
    audioOutLabel: 'aout',
  }
}
