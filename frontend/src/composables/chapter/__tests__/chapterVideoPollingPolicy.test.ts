import assert from 'node:assert/strict'

import {
  VIDEO_CLIENT_POLL_TOTAL_MS,
  resolveVideoPollOutcome,
  resolveVideoPollExhaustedOutcome,
} from '../chapterVideoPollingPolicy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('client video polling window covers the backend provider polling window', () => {
  assert.ok(VIDEO_CLIENT_POLL_TOTAL_MS >= 50 * 60 * 1000)
})

runTest('processing video status remains pending instead of failed', () => {
  assert.deepEqual(resolveVideoPollOutcome({ status: 'processing' }), { type: 'pending' })
  assert.deepEqual(resolveVideoPollOutcome({ status: 'running' }), { type: 'pending' })
  assert.deepEqual(resolveVideoPollOutcome({ status: 'failed_defect' }), { type: 'pending' })
})

runTest('storyboard video publication completes polling even when parent generation is not completed', () => {
  assert.deepEqual(
    resolveVideoPollOutcome({ status: 'failed_defect' }, { storyboardHasVideo: true }),
    { type: 'completed' },
  )
})

runTest('exhausted client polling is not treated as generation failure', () => {
  assert.deepEqual(resolveVideoPollExhaustedOutcome(), {
    type: 'pending',
    message: '视频仍在生成中，后台会继续处理，稍后刷新即可查看结果',
  })
})
