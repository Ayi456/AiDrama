import crypto from 'crypto'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../../utils/cos.js'
import { FFMPEG_PATH, getVideoDimensions, hasAudioStream } from '../ffmpeg/ffmpeg.js'
import { downloadMergeInputFile, type MergeInputFile } from './merge-inputs.js'

const NORMALIZED_MERGE_PROFILE_VERSION = 'merge-normalized-v1'
const DEFAULT_NORMALIZE_CONCURRENCY = 2
const DEFAULT_NORMALIZE_TIMEOUT_MS = 12 * 60 * 1000

export type MergeClipNormalizationMode = 'off' | 'fallback'

export type NormalizeMergeInput = MergeInputFile & {
  localPath: string
}

export type NormalizeMergeInputsOptions = {
  dataRoot: string
  storageRoot: string
  targetDimensions?: { width: number; height: number } | null
}

function sha1Hex(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex')
}

function fileExists(filePath: string) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
  } catch {
    return false
  }
}

function evenDimension(value: number) {
  const rounded = Math.max(2, Math.floor(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function normalizeDimensions(dimensions: { width: number; height: number }) {
  return {
    width: evenDimension(dimensions.width),
    height: evenDimension(dimensions.height),
  }
}

export function resolveMergeClipNormalizationMode(rawValue = process.env.MERGE_CLIP_NORMALIZATION): MergeClipNormalizationMode {
  const normalized = String(rawValue || '').trim().toLowerCase()
  return normalized === 'off' || normalized === 'false' || normalized === '0'
    ? 'off'
    : 'fallback'
}

export function resolveNormalizeConcurrency(rawValue = process.env.MERGE_NORMALIZE_CONCURRENCY) {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : DEFAULT_NORMALIZE_CONCURRENCY
}

export function resolveNormalizeTimeoutMs(rawValue = process.env.MERGE_NORMALIZE_TIMEOUT_MS) {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_NORMALIZE_TIMEOUT_MS
}

export function resolveNormalizedMergeClipRelativePath(sourceUrl: string, dimensions: { width: number; height: number }) {
  const normalized = normalizeDimensions(dimensions)
  const hash = sha1Hex([
    NORMALIZED_MERGE_PROFILE_VERSION,
    normalized.width,
    normalized.height,
    sourceUrl,
  ].join('|'))
  return `static/videos/normalized/${hash}.mp4`
}

export function buildNormalizeMergeClipArgs(input: {
  sourcePath: string
  outputPath: string
  dimensions: { width: number; height: number }
  hasAudio: boolean
}) {
  const dimensions = normalizeDimensions(input.dimensions)
  const videoFilter = [
    'fps=30',
    `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
    `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2`,
    'format=yuv420p',
  ].join(',')

  const args = ['-hide_banner', '-y', '-i', input.sourcePath]
  if (!input.hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
  }

  args.push(
    '-map', '0:v:0',
    '-map', input.hasAudio ? '0:a:0?' : '1:a:0',
    '-vf', videoFilter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '192k',
    '-movflags', '+faststart',
  )
  if (!input.hasAudio) args.push('-shortest')
  args.push(input.outputPath)
  return args
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0
  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const item = items[index]
      index += 1
      if (!item) return
      await worker(item)
    }
  }))
}

async function tryRestoreNormalizedClip(sourceUrl: string, localPath: string) {
  try {
    await downloadMergeInputFile({ sourceUrl, localPath })
  } catch {
    return false
  }
  return fileExists(localPath)
}

async function normalizeOneClip(
  input: NormalizeMergeInput,
  dimensions: { width: number; height: number },
  options: NormalizeMergeInputsOptions,
) {
  const relativePath = resolveNormalizedMergeClipRelativePath(input.sourceUrl, dimensions)
  const localPath = staticAssetToLocalPath(relativePath, options.dataRoot, options.storageRoot)
  if (fileExists(localPath)) return { localPath, relativePath }

  if (await tryRestoreNormalizedClip(relativePath, localPath)) {
    return { localPath, relativePath }
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  const tempPath = `${localPath}.${process.pid}.${Date.now()}.tmp`
  const hasAudio = await hasAudioStream(input.localPath)
  const args = buildNormalizeMergeClipArgs({
    sourcePath: input.localPath,
    outputPath: tempPath,
    dimensions,
    hasAudio,
  })
  const timeoutMs = resolveNormalizeTimeoutMs()

  await new Promise<void>((resolve, reject) => {
    execFile(FFMPEG_PATH, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\nffmpeg stderr tail:\n${stderr.slice(-4000)}` : ''}`))
        return
      }
      resolve()
    })
  })

  if (!fileExists(tempPath)) throw new Error(`Normalized clip was not created: ${tempPath}`)
  fs.renameSync(tempPath, localPath)
  await uploadStaticAssetToCos(relativePath, localPath).catch(error => {
    console.warn('[Merge] Failed to upload normalized clip cache:', error)
    return null
  })
  return { localPath, relativePath }
}

export async function normalizeMergeInputFiles(
  inputs: NormalizeMergeInput[],
  options: NormalizeMergeInputsOptions,
) {
  if (!inputs.length) return []
  const targetDimensions = options.targetDimensions
    ? normalizeDimensions(options.targetDimensions)
    : normalizeDimensions(await getVideoDimensions(inputs[0].localPath) || { width: 1280, height: 720 })

  const results = new Map<string, string>()
  const uniqueInputs = inputs.filter(input => {
    if (results.has(input.sourceUrl)) return false
    results.set(input.sourceUrl, '')
    return true
  })

  await runWithConcurrency(uniqueInputs, resolveNormalizeConcurrency(), async (input) => {
    const normalized = await normalizeOneClip(input, targetDimensions, options)
    results.set(input.sourceUrl, normalized.localPath)
  })

  return inputs.map(input => {
    const normalizedPath = results.get(input.sourceUrl)
    if (!normalizedPath) throw new Error(`Missing normalized merge clip for ${input.sourceUrl}`)
    return normalizedPath
  })
}
