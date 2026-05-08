import { ffmpeg, hasAudioStream } from './ffmpeg.js'

export type RunStoryboardComposeFfmpegInput = {
  inputPath: string
  outputPath: string
}

export type ComposeFfmpegCommand = {
  input: (value: string) => ComposeFfmpegCommand
  inputOptions: (value: string[]) => ComposeFfmpegCommand
  outputOptions: (value: string[]) => ComposeFfmpegCommand
  output: (value: string) => ComposeFfmpegCommand
  on: (event: 'end' | 'error', handler: (error?: Error) => void) => ComposeFfmpegCommand
  run: () => void
}

export type RunStoryboardComposeFfmpegDeps = {
  hasAudioStream: (filePath: string) => Promise<boolean>
  createCommand: (inputPath: string) => ComposeFfmpegCommand
}

export function buildComposeFfmpegOutputOptions(hasAudio: boolean) {
  return [
    '-map', '0:v:0',
    '-map', hasAudio ? '0:a:0' : '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-shortest',
    '-movflags', '+faststart',
  ]
}

export async function runStoryboardComposeFfmpeg(
  input: RunStoryboardComposeFfmpegInput,
  deps: RunStoryboardComposeFfmpegDeps = {
    hasAudioStream,
    createCommand: (inputPath) => ffmpeg(inputPath) as ComposeFfmpegCommand,
  },
) {
  const hasAudio = await deps.hasAudioStream(input.inputPath)

  await new Promise<void>((resolve, reject) => {
    const command = deps.createCommand(input.inputPath)

    if (!hasAudio) {
      command.input('anullsrc=channel_layout=stereo:sample_rate=48000')
        .inputOptions(['-f', 'lavfi'])
    }

    command
      .outputOptions(buildComposeFfmpegOutputOptions(hasAudio))
      .output(input.outputPath)
      .on('end', () => resolve())
      .on('error', error => reject(error))
      .run()
  })

  return { hasAudio }
}
