import assert from 'node:assert/strict'

import {
  canSplitStoryboardChunkForRetry,
  nextStoryboardRetryChunkChars,
  resolveStoryboardAdaptivePolicy,
} from '../storyboard-adaptive-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('resolveStoryboardAdaptivePolicy uses conservative model-agnostic defaults', () => {
  assert.deepEqual(resolveStoryboardAdaptivePolicy(), {
    chunkChars: 1200,
    minChunkChars: 350,
    retryShrinkRatio: 0.5,
    maxAttempts: 3,
    chunkTimeoutMs: 600_000,
  })
})

runTest('resolveStoryboardAdaptivePolicy accepts text config settings and route override', () => {
  assert.deepEqual(resolveStoryboardAdaptivePolicy({
    storyboardChunkChars: 1800,
    storyboardMinChunkChars: 500,
    storyboardRetryShrinkRatio: 0.4,
    storyboardChunkRetries: 4,
    storyboardChunkTimeoutMs: 720_000,
  }, {
    chunkChars: 900,
  }), {
    chunkChars: 900,
    minChunkChars: 500,
    retryShrinkRatio: 0.4,
    maxAttempts: 4,
    chunkTimeoutMs: 720_000,
  })
})

runTest('nextStoryboardRetryChunkChars shrinks but does not go below the minimum', () => {
  const policy = resolveStoryboardAdaptivePolicy({
    storyboardRetryShrinkRatio: 0.5,
    storyboardMinChunkChars: 350,
  })

  assert.equal(nextStoryboardRetryChunkChars(1200, policy), 600)
  assert.equal(nextStoryboardRetryChunkChars(500, policy), 350)
})

runTest('canSplitStoryboardChunkForRetry stops at max attempts or minimum size', () => {
  const policy = resolveStoryboardAdaptivePolicy({
    storyboardChunkRetries: 3,
    storyboardMinChunkChars: 350,
  })

  assert.equal(canSplitStoryboardChunkForRetry(1000, 1, policy), true)
  assert.equal(canSplitStoryboardChunkForRetry(1000, 3, policy), false)
  assert.equal(canSplitStoryboardChunkForRetry(350, 1, policy), false)
})
