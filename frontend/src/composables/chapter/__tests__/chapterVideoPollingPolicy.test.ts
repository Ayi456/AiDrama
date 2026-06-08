import assert from 'node:assert/strict'

import {
  VIDEO_CLIENT_POLL_TOTAL_MS,
  hasNewStoryboardVideo,
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

runTest('completed generation waits until a video url is available', () => {
  assert.deepEqual(resolveVideoPollOutcome({ status: 'completed' }), { type: 'pending' })
  assert.deepEqual(resolveVideoPollOutcome({ status: 'completed', video_url: 'https://cdn.example.com/shot.mp4' }), { type: 'completed' })
})

runTest('effective regeneration status keeps polling while the child task is running', () => {
  assert.deepEqual(
    resolveVideoPollOutcome({
      status: 'failed_defect',
      effective_status: 'processing',
      regeneration_id: 42,
    }),
    { type: 'pending' },
  )
})

runTest('effective regeneration completion uses the regenerated video url', () => {
  assert.deepEqual(
    resolveVideoPollOutcome({
      status: 'failed_defect',
      effective_status: 'completed',
      effective_video_url: 'https://cdn.example.com/regenerated.mp4',
    }),
    { type: 'completed' },
  )
})

runTest('effective regeneration failure reports the child failure message', () => {
  assert.deepEqual(
    resolveVideoPollOutcome({
      status: 'failed_defect',
      effective_status: 'failed',
      effective_error_msg: 'provider failed',
    }),
    { type: 'failed', message: 'provider failed' },
  )
})

runTest('storyboard video completion requires a new url when regenerating', () => {
  assert.equal(hasNewStoryboardVideo('', 'https://cdn.example.com/old.mp4'), false)
  assert.equal(hasNewStoryboardVideo('https://cdn.example.com/old.mp4', 'https://cdn.example.com/old.mp4'), false)
  assert.equal(hasNewStoryboardVideo('https://cdn.example.com/new.mp4', 'https://cdn.example.com/old.mp4'), true)
  assert.equal(hasNewStoryboardVideo('https://cdn.example.com/first.mp4', ''), true)
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
