import assert from 'node:assert/strict'

import {
  buildJobFailurePatch,
  buildJobProcessingPatch,
  buildJobSnapshotPatch,
  normalizeJobErrorMessage,
  serializeJobPayload,
} from '../media-job-state.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('serializeJobPayload stores JSON snapshots and returns null for unserializable payloads', () => {
  const circular: { self?: unknown } = {}
  circular.self = circular

  assert.equal(serializeJobPayload({ prompt: 'hello', refs: ['a.png'] }), '{"prompt":"hello","refs":["a.png"]}')
  assert.equal(serializeJobPayload(circular), null)
})

runTest('buildJobSnapshotPatch targets one provider snapshot field with a fresh timestamp', () => {
  assert.deepEqual(
    buildJobSnapshotPatch('providerResponse', { status: 'completed' }, 't1'),
    { providerResponse: '{"status":"completed"}', updatedAt: 't1' },
  )
})

runTest('buildJobProcessingPatch records async task ownership consistently', () => {
  assert.deepEqual(
    buildJobProcessingPatch('task-123', 't2'),
    { taskId: 'task-123', status: 'processing', updatedAt: 't2' },
  )
})

runTest('buildJobFailurePatch normalizes unknown errors before persistence', () => {
  assert.equal(normalizeJobErrorMessage(new Error('provider rejected')), 'provider rejected')
  assert.equal(normalizeJobErrorMessage('plain failure'), 'plain failure')
  assert.deepEqual(
    buildJobFailurePatch(new Error('provider rejected'), 't3'),
    { status: 'failed', errorMsg: 'provider rejected', updatedAt: 't3' },
  )
})
