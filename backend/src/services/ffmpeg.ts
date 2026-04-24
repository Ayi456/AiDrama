import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'

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

export const FFMPEG_PATH = firstExistingPath([
  process.env.FFMPEG_PATH,
  process.platform !== 'win32' ? '/opt/bin/ffmpeg' : undefined,
  process.platform === 'win32' ? 'D:\\ChromeDownload\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe' : undefined,
  wingetFfmpegPath('ffmpeg.exe'),
]) || 'ffmpeg'

export const FFPROBE_PATH = firstExistingPath([
  process.env.FFPROBE_PATH,
  process.platform !== 'win32' ? '/opt/bin/ffprobe' : undefined,
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

export function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(false); return }
      const streams = Array.isArray(metadata.streams) ? metadata.streams : []
      resolve(streams.some(stream => String(stream.codec_type || '').toLowerCase() === 'audio'))
    })
  })
}

export { ffmpeg }
