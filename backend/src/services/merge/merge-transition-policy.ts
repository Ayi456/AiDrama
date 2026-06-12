export const TRANSITION_TYPE_WHITELIST = [
  'fade',
  'fadeblack',
  'fadewhite',
  'slideleft',
  'slideright',
  'slideup',
  'circleopen',
  'circleclose',
  'wipeleft',
  'pixelize',
] as const
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

export type SeamOverrideInput = {
  type?: string | null
  durationMs?: number | null
} | null | undefined

/**
 * Resolve one transition config per seam (clipCount - 1 entries).
 * Each seam either uses its own override or inherits the global default.
 */
export function resolveSeamTransitions(
  globalDefault: TransitionConfig,
  seamOverrides: SeamOverrideInput[],
): TransitionConfig[] {
  return seamOverrides.map((override) => {
    if (!override) return { ...globalDefault }
    const type = normalizeTransitionType(override.type) ?? globalDefault.type
    const durationMs = override.durationMs == null
      ? globalDefault.durationMs
      : normalizeTransitionDurationMs(override.durationMs) ?? globalDefault.durationMs
    return { type, durationMs }
  })
}

/** Transitions are worth running when there are 2+ clips and at least one seam has a positive duration. */
export function isAnyTransitionEnabled(seamTransitions: TransitionConfig[], clipCount: number): boolean {
  return clipCount >= 2 && seamTransitions.some((seam) => seam.durationMs > 0)
}

export type VideoFrameRate = { num: number; den: number }

const MIN_PLAUSIBLE_FPS = 1
const MAX_PLAUSIBLE_FPS = 120
export const DEFAULT_XFADE_FPS = '30'

/** Pick the highest plausible source frame rate so normalization never drops frames. */
export function pickXfadeFps(rates: Array<VideoFrameRate | null | undefined>): string {
  let best: VideoFrameRate | null = null
  let bestValue = 0
  for (const rate of rates) {
    if (!rate || !Number.isFinite(rate.num) || !Number.isFinite(rate.den) || rate.den <= 0) continue
    const value = rate.num / rate.den
    if (value < MIN_PLAUSIBLE_FPS || value > MAX_PLAUSIBLE_FPS) continue
    if (value > bestValue) {
      best = rate
      bestValue = value
    }
  }
  if (!best) return DEFAULT_XFADE_FPS
  return Number.isInteger(bestValue) ? String(bestValue) : `${best.num}/${best.den}`
}

export type XfadeMergeStep = {
  /** Node ids to merge in order; 0..clipCount-1 are original clips, higher ids are intermediates */
  inputNodes: number[]
  /** Original seam index between each pair of consecutive inputs (length = inputNodes.length - 1) */
  seamIndices: number[]
  /** Node id assigned to this step's output */
  outputNode: number
}

/**
 * Plan a bottom-up merge tree with at most `maxGroupSize` inputs per ffmpeg run, so peak memory
 * stays constant regardless of clip count. Each step merges consecutive nodes; the seam between
 * two nodes is the original seam between the last clip of the left node and the first clip of
 * the right node. The final step's outputNode is the root.
 */
export function planXfadeMergeTree(clipCount: number, maxGroupSize = 4): XfadeMergeStep[] {
  if (clipCount < 2) return []
  const groupSize = Math.max(2, Math.floor(maxGroupSize))

  let nodes = Array.from({ length: clipCount }, (_, i) => ({ id: i, lastClip: i }))
  let nextId = clipCount
  const steps: XfadeMergeStep[] = []

  while (nodes.length > 1) {
    const nextLevel: typeof nodes = []
    for (let i = 0; i < nodes.length; i += groupSize) {
      const group = nodes.slice(i, i + groupSize)
      if (group.length === 1) {
        nextLevel.push(group[0])
        continue
      }
      steps.push({
        inputNodes: group.map(node => node.id),
        seamIndices: group.slice(0, -1).map(node => node.lastClip),
        outputNode: nextId,
      })
      nextLevel.push({ id: nextId, lastClip: group[group.length - 1].lastClip })
      nextId++
    }
    nodes = nextLevel
  }

  return steps
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
 * Per-seam max transition duration: bounded by each seam's configured duration, and by half of
 * each adjacent clip. If a seam ends up below MIN_SEAM_DURATION_SECONDS (clip too short), it
 * degrades to a hard cut.
 *
 * `seamDurationsMs` has one entry per seam (clipCount - 1).
 */
export function computeSeamDurations(
  clipDurationsSeconds: number[],
  seamDurationsMs: number[],
): SeamDurations {
  const seamDurations: number[] = []
  const seamOffsets: number[] = []

  let cumulative = 0
  for (let k = 0; k < clipDurationsSeconds.length - 1; k++) {
    const left = clipDurationsSeconds[k]
    const right = clipDurationsSeconds[k + 1]
    const d = (seamDurationsMs[k] ?? 0) / 1000
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
 * Build the filter_complex string for xfade + acrossfade, using a per-seam transition config.
 * Returns null when there is nothing to transition (clipCount < 2 or all seams degraded to 0).
 *
 * `seamTransitions` has one entry per seam (clipCount - 1), each with its own type and duration.
 *
 * Stream labels:
 *   inputs:  [0:v], [0:a], [1:v], [1:a], ...
 *   outputs: [vout] and [aout]
 *
 * Caller is responsible for input ordering and audio source labels (e.g. anullsrc backfill).
 */
export function buildXfadeFilter(
  clipDurationsSeconds: number[],
  seamTransitions: TransitionConfig[],
  audioLabels: string[],
  fps: string = DEFAULT_XFADE_FPS,
  opts: { emitWhenAllSeamsZero?: boolean } = {},
): { filter: string; videoOutLabel: string; audioOutLabel: string } | null {
  const n = clipDurationsSeconds.length
  if (n < 2) return null
  if (audioLabels.length !== n) {
    throw new Error(`audioLabels length ${audioLabels.length} != clipCount ${n}`)
  }
  if (seamTransitions.length !== n - 1) {
    throw new Error(`seamTransitions length ${seamTransitions.length} != seams ${n - 1}`)
  }

  const { seamDurations, seamOffsets } = computeSeamDurations(
    clipDurationsSeconds,
    seamTransitions.map((seam) => seam.durationMs),
  )
  if (seamDurations.every(seam => seam <= 0) && !opts.emitWhenAllSeamsZero) return null

  // xfade / acrossfade require all inputs to share fps / pixel format / sample rate / channel layout
  // and start at PTS=0. Normalize every video and audio stream before feeding the transition chain.
  // fps must come AFTER setpts: setpts resets the frame-rate metadata to unknown (1/0), and
  // ffmpeg 7.x xfade rejects non-constant frame rate inputs.
  const normSteps: string[] = []
  const normalizedVideoLabels: string[] = []
  const normalizedAudioLabels: string[] = []

  for (let k = 0; k < n; k++) {
    const vLabel = `[v${k}n]`
    const aLabel = `[a${k}n]`
    normSteps.push(`[${k}:v]setpts=PTS-STARTPTS,fps=${fps},format=yuv420p${vLabel}`)
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
      const type = seamTransitions[k].type
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
