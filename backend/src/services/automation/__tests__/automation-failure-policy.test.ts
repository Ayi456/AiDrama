import test from 'node:test'
import assert from 'node:assert/strict'
import { computeVideoFailureDecision } from '../automation-failure-policy.js'

test('video failure increments attempt while retries remain', () => {
  const decision = computeVideoFailureDecision({
    status: 'running',
    stage: 'video',
    attempt: 0,
    maxRetries: 2,
    errorMessage: 'provider rejected input image',
  })

  assert.deepEqual(decision, {
    type: 'retry',
    nextAttempt: 1,
    error: 'provider rejected input image',
  })
})

test('video failure marks automation failed after retry budget is exhausted', () => {
  const decision = computeVideoFailureDecision({
    status: 'running',
    stage: 'video',
    attempt: 2,
    maxRetries: 2,
    errorMessage: 'provider rejected input image',
  })

  assert.deepEqual(decision, {
    type: 'fail',
    nextAttempt: 3,
    error: 'provider rejected input image',
  })
})

test('video failure policy ignores non-running or non-video episodes', () => {
  assert.deepEqual(computeVideoFailureDecision({
    status: 'paused',
    stage: 'video',
    attempt: 0,
    maxRetries: 2,
    errorMessage: 'x',
  }), { type: 'ignore' })

  assert.deepEqual(computeVideoFailureDecision({
    status: 'running',
    stage: 'scene_image',
    attempt: 0,
    maxRetries: 2,
    errorMessage: 'x',
  }), { type: 'ignore' })
})
