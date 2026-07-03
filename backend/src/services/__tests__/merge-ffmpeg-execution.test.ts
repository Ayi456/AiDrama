import assert from 'node:assert/strict'

import {
  buildXfadeStageAudioPlan,
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

await runTest('runFfmpegMergeStrategies reports xfade fallback reason before degrading to hard cut', async () => {
  const attempted: string[] = []
  const fallbacks: string[] = []

  const strategy = await runFfmpegMergeStrategies({
    mergeId: 43,
    episodeId: 9,
    listPath: 'C:/tmp/list.txt',
    outputPath: 'C:/tmp/out.mp4',
    clipCount: 2,
    clipPaths: ['C:/tmp/a.mp4', 'C:/tmp/b.mp4'],
    seamTransitions: [{ type: 'fade', durationMs: 500 }],
    onXfadeFallback: reason => fallbacks.push(reason),
  }, {
    outputExists: () => false,
    removeOutput: () => undefined,
    runConcat: async ({ strategy }) => {
      attempted.push(strategy)
      if (strategy === 'xfade') throw new Error('ffmpeg was killed with signal SIGKILL')
    },
    logWarn: () => undefined,
    supportsXfade: async () => true,
  })

  assert.equal(strategy, 'transcode')
  assert.deepEqual(attempted, ['xfade', 'transcode'])
  assert.deepEqual(fallbacks, ['ffmpeg was killed with signal SIGKILL'])
})

await runTest('runFfmpegMergeStrategies reports unsupported xfade before skipping it', async () => {
  const attempted: string[] = []
  const fallbacks: string[] = []

  const strategy = await runFfmpegMergeStrategies({
    mergeId: 44,
    episodeId: 9,
    listPath: 'C:/tmp/list.txt',
    outputPath: 'C:/tmp/out.mp4',
    clipCount: 2,
    clipPaths: ['C:/tmp/a.mp4', 'C:/tmp/b.mp4'],
    seamTransitions: [{ type: 'fade', durationMs: 500 }],
    onXfadeFallback: reason => fallbacks.push(reason),
  }, {
    outputExists: () => false,
    removeOutput: () => undefined,
    runConcat: async ({ strategy }) => {
      attempted.push(strategy)
    },
    logWarn: () => undefined,
    supportsXfade: async () => false,
  })

  assert.equal(strategy, 'copy')
  assert.deepEqual(attempted, ['copy'])
  assert.deepEqual(fallbacks, ['xfade filter unavailable in ffmpeg'])
})

await runTest('buildXfadeStageAudioPlan backfills missing audio with finite silent sources', () => {
  const plan = buildXfadeStageAudioPlan(
    [0, 1, 2],
    [false, true, false],
    [4.2, 5, 6.75],
  )

  assert.deepEqual(plan.audioLabels, ['[silent0a]', '[1:a]', '[silent2a]'])
  assert.deepEqual(plan.preludeFilters, [
    'anullsrc=channel_layout=stereo:sample_rate=48000:d=4.200[silent0a]',
    'anullsrc=channel_layout=stereo:sample_rate=48000:d=6.750[silent2a]',
  ])
})
