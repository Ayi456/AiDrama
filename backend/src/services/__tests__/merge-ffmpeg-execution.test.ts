import assert from 'node:assert/strict'

import {
  runFfmpegMergeStrategies,
} from '../merge/merge-ffmpeg-execution.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('runFfmpegMergeStrategies falls back from copy to transcode and removes stale outputs', async () => {
  const attempted: string[] = []
  const removed: string[] = []
  const warnings: unknown[] = []

  const strategy = await runFfmpegMergeStrategies({
    mergeId: 41,
    episodeId: 7,
    listPath: 'C:/tmp/list.txt',
    outputPath: 'C:/tmp/out.mp4',
    clipCount: 3,
  }, {
    outputExists: () => true,
    removeOutput: (outputPath) => {
      removed.push(outputPath)
    },
    runConcat: async ({ strategy }) => {
      attempted.push(strategy)
      if (strategy === 'copy') throw new Error('stream copy unsupported')
    },
    logWarn: (taskName, event, payload) => {
      warnings.push({ taskName, event, payload })
    },
  })

  assert.equal(strategy, 'transcode')
  assert.deepEqual(attempted, ['copy', 'transcode'])
  assert.deepEqual(removed, ['C:/tmp/out.mp4', 'C:/tmp/out.mp4'])
  assert.deepEqual(warnings, [{
    taskName: 'MergeTask',
    event: 'ffmpeg-copy-fallback',
    payload: {
      mergeId: 41,
      episodeId: 7,
      reason: 'stream copy unsupported',
    },
  }])
})

await runTest('runFfmpegMergeStrategies throws the final FFmpeg error when all strategies fail', async () => {
  await assert.rejects(
    () => runFfmpegMergeStrategies({
      mergeId: 42,
      episodeId: 8,
      listPath: 'C:/tmp/list.txt',
      outputPath: 'C:/tmp/out.mp4',
      clipCount: 2,
    }, {
      outputExists: () => false,
      removeOutput: () => assert.fail('missing outputs should not be removed'),
      runConcat: async ({ strategy }) => {
        throw new Error(`${strategy} failed`)
      },
      logWarn: () => undefined,
    }),
    /transcode failed/,
  )
})
