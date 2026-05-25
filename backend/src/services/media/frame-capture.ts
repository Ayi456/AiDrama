import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(ffmpegPath.path)

export type CaptureArgs = {
  input: string
  output: string
  inputOptions: string[]
  outputOptions: string[]
}

export function buildCaptureLastFrameArgs(input: string, output: string): CaptureArgs {
  return {
    input,
    output,
    inputOptions: ['-sseof', '-1'],
    outputOptions: ['-update', '1', '-q:v', '1'],
  }
}

export function resolveTailFrameOutputPath(videoId: number, staticRoot: string): string {
  return join(staticRoot, 'tail-frames', `${videoId}.png`)
}

export async function captureLastFrame(videoPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true })
  const args = buildCaptureLastFrameArgs(videoPath, outputPath)
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(args.input)
      .inputOptions(args.inputOptions)
      .outputOptions(args.outputOptions)
      .output(args.output)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
  return outputPath
}
