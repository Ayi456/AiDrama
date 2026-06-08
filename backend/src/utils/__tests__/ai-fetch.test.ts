import assert from 'node:assert/strict'

import {
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  resolveAiRequestTimeoutMs,
} from '../ai-fetch.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('resolveAiRequestTimeoutMs defaults above the storyboard chunk deadline', () => {
  assert.equal(DEFAULT_AI_REQUEST_TIMEOUT_MS, 660_000)
  assert.equal(resolveAiRequestTimeoutMs(undefined), DEFAULT_AI_REQUEST_TIMEOUT_MS)
  assert.equal(resolveAiRequestTimeoutMs(''), DEFAULT_AI_REQUEST_TIMEOUT_MS)
  assert.equal(resolveAiRequestTimeoutMs('0'), DEFAULT_AI_REQUEST_TIMEOUT_MS)
})

runTest('resolveAiRequestTimeoutMs accepts explicit positive overrides', () => {
  assert.equal(resolveAiRequestTimeoutMs('120000'), 120_000)
  assert.equal(resolveAiRequestTimeoutMs(900_000), 900_000)
})
