import ffmpeg from 'fluent-ffmpeg'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ensureProjectEnvLoaded } from '../../utils/project-env.js'

ensureProjectEnvLoaded()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

export function firstExistingPath(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {
      // ignore inaccessible candidates
    }
  }
  return undefined
}

function binaryName(name: 'ffmpeg' | 'ffprobe', platform = process.platform) {
  return platform === 'win32' ? `${name}.exe` : name
}

export function scfLayerFfmpegCandidatePaths(optRoot = '/opt', platform = process.platform): string[] {
  if (platform === 'win32') return []
  const name = binaryName('ffmpeg', platform)
  return [
    path.join(optRoot, 'bin', name),
    path.join(optRoot, 'ffmpeg', 'bin', name),
    path.join(optRoot, 'ffmpeg', name),
    path.join(optRoot, name),
  ]
}

export function scfLayerFfprobeCandidatePaths(optRoot = '/opt', platform = process.platform): string[] {
  if (platform === 'win32') return []
  const name = binaryName('ffprobe', platform)
  return [
    path.join(optRoot, 'bin', name),
    path.join(optRoot, 'ffmpeg', 'bin', name),
    path.join(optRoot, 'ffprobe', 'bin', name),
    path.join(optRoot, 'ffprobe', name),
    path.join(optRoot, name),
  ]
}

type RuntimeBinaryCandidateOptions = {
  projectRoot?: string
  platform?: NodeJS.Platform
}

export function runtimeFfmpegCandidatePaths(options: RuntimeBinaryCandidateOptions = {}): string[] {
  const projectRoot = options.projectRoot ?? PROJECT_ROOT
  const platform = options.platform ?? process.platform
  const name = binaryName('ffmpeg', platform)
  return [
    process.env.FFMPEG_PATH,
    ...scfLayerFfmpegCandidatePaths('/opt', platform),
    path.join(projectRoot, 'bin', name),
    'ffmpeg',
  ].filter((candidate): candidate is string => Boolean(candidate))
}

export function runtimeFfprobeCandidatePaths(options: RuntimeBinaryCandidateOptions = {}): string[] {
  const projectRoot = options.projectRoot ?? PROJECT_ROOT
  const platform = options.platform ?? process.platform
  const name = binaryName('ffprobe', platform)
  return [
    process.env.FFPROBE_PATH,
    ...scfLayerFfprobeCandidatePaths('/opt', platform),
    path.join(projectRoot, 'bin', name),
    'ffprobe',
  ].filter((candidate): candidate is string => Boolean(candidate))
}

export const FFMPEG_PATH = firstExistingPath(runtimeFfmpegCandidatePaths()) || 'ffmpeg'

export const FFPROBE_PATH = firstExistingPath(runtimeFfprobeCandidatePaths()) || 'ffprobe'

ffmpeg.setFfmpegPath(FFMPEG_PATH)
ffmpeg.setFfprobePath(FFPROBE_PATH)

export function escapeConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}

export function getVideoDurationPrecise(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Number(metadata.format.duration) || 0)
    })
  })
}

export type VideoStreamInfo = {
  durationSeconds: number
  frameRate: { num: number; den: number } | null
}

function parseFrameRate(raw: unknown): { num: number; den: number } | null {
  const match = /^(\d+)\/(\d+)$/.exec(String(raw ?? ''))
  if (!match) return null
  const num = Number(match[1])
  const den = Number(match[2])
  if (!(num > 0) || !(den > 0)) return null
  return { num, den }
}

export function getVideoStreamInfo(filePath: string): Promise<VideoStreamInfo | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(null); return }
      const streams = Array.isArray(metadata.streams) ? metadata.streams : []
      const video = streams.find(stream => String(stream.codec_type || '').toLowerCase() === 'video')
      resolve({
        durationSeconds: Number(metadata.format.duration) || 0,
        frameRate: parseFrameRate(video?.r_frame_rate),
      })
    })
  })
}

export function getVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(null); return }
      const streams = Array.isArray(metadata.streams) ? metadata.streams : []
      const video = streams.find(stream => String(stream.codec_type || '').toLowerCase() === 'video')
      const width = Number(video?.width)
      const height = Number(video?.height)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        resolve(null)
        return
      }
      resolve({
        width: Math.floor(width),
        height: Math.floor(height),
      })
    })
  })
}

export function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(false); return }
      const streams = Array.isArray(metadata.streams) ? metadata.streams : []
      resolve(streams.some(stream => String(stream.codec_type || '').toLowerCase() === 'audio'))
    })
  })
}

let xfadeSupportCache: Promise<boolean> | null = null

export function ffmpegSupportsXfade(): Promise<boolean> {
  if (xfadeSupportCache) return xfadeSupportCache
  xfadeSupportCache = new Promise<boolean>(resolve => {
    execFile(FFMPEG_PATH, ['-hide_banner', '-filters'], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve(false); return }
      resolve(/\bxfade\b/.test(stdout))
    })
  })
  return xfadeSupportCache
}

type BinaryProbe = { ok: boolean; output: string }

function execFileProbe(file: string, args: string[]): Promise<BinaryProbe> {
  return new Promise(resolve => {
    execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { resolve({ ok: false, output: String(error.message || error) }); return }
      resolve({ ok: true, output: String(stdout || stderr || '') })
    })
  })
}

function firstLine(text: string) {
  return text.split('\n')[0]?.trim() ?? ''
}

export async function getFfmpegDiagnostics() {
  const [version, filters, probeVersion] = await Promise.all([
    execFileProbe(FFMPEG_PATH, ['-version']),
    execFileProbe(FFMPEG_PATH, ['-hide_banner', '-filters']),
    execFileProbe(FFPROBE_PATH, ['-version']),
  ])
  return {
    platform: process.platform,
    envFfmpegPath: process.env.FFMPEG_PATH ?? null,
    envFfprobePath: process.env.FFPROBE_PATH ?? null,
    ffmpegPath: FFMPEG_PATH,
    ffprobePath: FFPROBE_PATH,
    ffmpegOk: version.ok,
    ffmpegVersion: firstLine(version.output),
    ffprobeOk: probeVersion.ok,
    ffprobeVersion: firstLine(probeVersion.output),
    xfadeSupported: filters.ok && /\bxfade\b/.test(filters.output),
    filtersProbeError: filters.ok ? null : firstLine(filters.output),
  }
}

export { ffmpeg }
