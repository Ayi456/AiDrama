import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_VIDEO_POLL_TIMEOUT_MS,
  DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS,
  resolveVideoPollTimeoutMs,
  resolveVideoSubmitTimeoutMs,
} from '../generation/video-provider-timeout-policy.js'

test('video provider timeouts use bounded defaults', () => {
  assert.equal(resolveVideoSubmitTimeoutMs(undefined), DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS)
  assert.equal(resolveVideoPollTimeoutMs(undefined), DEFAULT_VIDEO_POLL_TIMEOUT_MS)
})

test('video provider timeouts accept positive overrides', () => {
  assert.equal(resolveVideoSubmitTimeoutMs('45000'), 45_000)
  assert.equal(resolveVideoPollTimeoutMs(12_500.4), 12_500)
})

test('video provider timeouts reject invalid overrides', () => {
  assert.equal(resolveVideoSubmitTimeoutMs('not-a-number'), DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS)
  assert.equal(resolveVideoSubmitTimeoutMs(0), DEFAULT_VIDEO_SUBMIT_TIMEOUT_MS)
  assert.equal(resolveVideoPollTimeoutMs(-1), DEFAULT_VIDEO_POLL_TIMEOUT_MS)
})
