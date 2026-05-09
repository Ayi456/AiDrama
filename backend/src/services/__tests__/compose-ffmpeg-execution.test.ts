import assert from 'node:assert/strict'

import {
  buildComposeFfmpegOutputOptions,
  runStoryboardComposeFfmpeg,
} from '../compose/compose-ffmpeg-execution.js'

type FakeCommand = {
  inputCalls: string[]
  inputOptionCalls: string[][]
  outputOptionCalls: string[][]
  outputCalls: string[]
  handlers: Record<string, (value?: Error) => void>
  input: (value: string) => FakeCommand
  inputOptions: (value: string[]) => FakeCommand
  outputOptions: (value: string[]) => FakeCommand
  output: (value: string) => FakeCommand
  on: (event: string, handler: (value?: Error) => void) => FakeCommand
  run: () => void
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function createFakeCommand(): FakeCommand {
  const command: FakeCommand = {
    inputCalls: [],
    inputOptionCalls: [],
    outputOptionCalls: [],
    outputCalls: [],
    handlers: {},
    input(value) {
      this.inputCalls.push(value)
      return this
    },
    inputOptions(value) {
      this.inputOptionCalls.push(value)
      return this
    },
    outputOptions(value) {
      this.outputOptionCalls.push(value)
      return this
    },
    output(value) {
      this.outputCalls.push(value)
      return this
    },
    on(event, handler) {
      this.handlers[event] = handler
      return this
    },
    run() {
      this.handlers.end()
    },
  }
  return command
}

await runTest('buildComposeFfmpegOutputOptions maps existing or silent audio sources', () => {
  assert.deepEqual(
    buildComposeFfmpegOutputOptions(true).slice(0, 4),
    ['-map', '0:v:0', '-map', '0:a:0'],
  )
  assert.deepEqual(
    buildComposeFfmpegOutputOptions(false).slice(0, 4),
    ['-map', '0:v:0', '-map', '1:a:0'],
  )
})

await runTest('runStoryboardComposeFfmpeg injects silent audio only for video without audio', async () => {
  const silentCommand = createFakeCommand()
  await runStoryboardComposeFfmpeg({
    inputPath: 'C:/video/no-audio.mp4',
    outputPath: 'C:/out/no-audio.mp4',
  }, {
    hasAudioStream: async () => false,
    createCommand: () => silentCommand,
  })

  assert.deepEqual(silentCommand.inputCalls, ['anullsrc=channel_layout=stereo:sample_rate=48000'])
  assert.deepEqual(silentCommand.inputOptionCalls, [['-f', 'lavfi']])
  assert.deepEqual(silentCommand.outputCalls, ['C:/out/no-audio.mp4'])
  assert.deepEqual(silentCommand.outputOptionCalls[0].slice(0, 4), ['-map', '0:v:0', '-map', '1:a:0'])

  const audioCommand = createFakeCommand()
  await runStoryboardComposeFfmpeg({
    inputPath: 'C:/video/with-audio.mp4',
    outputPath: 'C:/out/with-audio.mp4',
  }, {
    hasAudioStream: async () => true,
    createCommand: () => audioCommand,
  })

  assert.deepEqual(audioCommand.inputCalls, [])
  assert.deepEqual(audioCommand.inputOptionCalls, [])
  assert.deepEqual(audioCommand.outputCalls, ['C:/out/with-audio.mp4'])
  assert.deepEqual(audioCommand.outputOptionCalls[0].slice(0, 4), ['-map', '0:v:0', '-map', '0:a:0'])
})
