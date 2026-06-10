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
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore inaccessible candidates
    }
  }
  return undefined
}

function wingetFfmpegPath(binary: 'ffmpeg.exe' | 'ffprobe.exe'): string | undefined {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return undefined
  return path.join(
    process.env.LOCALAPPDATA,
    'Microsoft',
    'WinGet',
    'Packages',
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-8.0.1-full_build',
    'bin',
    binary,
  )
}

function binaryName(name: 'ffmpeg' | 'ffprobe') {
  return process.platform === 'win32' ? `${name}.exe` : name
}

function nodeModuleRoots(projectRoot = PROJECT_ROOT) {
  return [
    path.join(projectRoot, 'node_modules'),
    path.join(projectRoot, 'backend', 'node_modules'),
  ]
}

export function bundledFfmpegCandidatePaths(projectRoot = PROJECT_ROOT): string[] {
  const name = binaryName('ffmpeg')
  const platformPackage = `${process.platform}-${process.arch}`
  return nodeModuleRoots(projectRoot).flatMap(nodeModules => [
    path.join(nodeModules, '@ffmpeg-installer', platformPackage, name),
    path.join(nodeModules, 'ffmpeg-static', name),
  ])
}

export function bundledFfprobeCandidatePaths(projectRoot = PROJECT_ROOT): string[] {
  const name = binaryName('ffprobe')
  const platformPackage = `${process.platform}-${process.arch}`
  return nodeModuleRoots(projectRoot).flatMap(nodeModules => [
    path.join(nodeModules, '@ffprobe-installer', platformPackage, name),
    path.join(nodeModules, 'ffprobe-static', 'bin', process.platform, process.arch, name),
    path.join(nodeModules, 'ffprobe-static', name),
  ])
}

export const FFMPEG_PATH = firstExistingPath([
  process.env.FFMPEG_PATH,
  process.platform !== 'win32' ? '/opt/bin/ffmpeg' : undefined,
  process.platform !== 'win32' ? path.join(PROJECT_ROOT, 'bin', 'ffmpeg') : undefined,
  ...bundledFfmpegCandidatePaths(),
  process.platform === 'win32' ? 'D:\\ChromeDownload\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe' : undefined,
  wingetFfmpegPath('ffmpeg.exe'),
]) || 'ffmpeg'

export const FFPROBE_PATH = firstExistingPath([
  process.env.FFPROBE_PATH,
  process.platform !== 'win32' ? '/opt/bin/ffprobe' : undefined,
  process.platform !== 'win32' ? path.join(PROJECT_ROOT, 'bin', 'ffprobe') : undefined,
  ...bundledFfprobeCandidatePaths(),
  process.platform === 'win32' ? 'D:\\ChromeDownload\\ffmpeg-8.0.1-full_build\\bin\\ffprobe.exe' : undefined,
  wingetFfmpegPath('ffprobe.exe'),
]) || 'ffprobe'

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

export { ffmpeg }
