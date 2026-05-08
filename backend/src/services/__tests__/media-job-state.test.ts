import assert from 'node:assert/strict'

import {
  buildJobFailurePatch,
  buildJobProcessingPatch,
  buildJobSnapshotPatch,
  createMediaJobSnapshotPersistor,
  logDetachedMediaJobError,
  normalizeJobErrorMessage,
  recordMediaJobFailure,
  recordMediaJobProcessingHandoff,
  recordMediaJobTimeout,
  serializeJobPayload,
} from '../media-job-state.js'

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL ${name}`)
      throw error
    })
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

runTest('createMediaJobSnapshotPersistor persists normalized snapshot patches', async () => {
  const patches: unknown[] = []
  const persistSnapshot = createMediaJobSnapshotPersistor({
    persistPatch: async (patch) => {
      patches.push(patch)
    },
  })

  await persistSnapshot('normalizedRequest', { prompt: 'hello' }, 't1b')

  assert.deepEqual(patches, [{
    normalizedRequest: '{"prompt":"hello"}',
    updatedAt: 't1b',
  }])
})

runTest('buildJobProcessingPatch records async task ownership consistently', () => {
  assert.deepEqual(
    buildJobProcessingPatch('task-123', 't2'),
    { taskId: 'task-123', status: 'processing', updatedAt: 't2' },
  )
})

runTest('recordMediaJobProcessingHandoff logs poll start and persists processing state', async () => {
  const logs: unknown[] = []
  const patches: unknown[] = []

  await recordMediaJobProcessingHandoff({
    taskName: 'VideoTask',
    event: 'poll-start',
    id: 21,
    taskId: 'task-21',
    provider: 'volcengine',
    updatedAt: 't2b',
  }, {
    logProgress: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
    persistProcessing: async (patch) => {
      patches.push(patch)
    },
  })

  assert.deepEqual(logs, [{
    taskName: 'VideoTask',
    event: 'poll-start',
    payload: {
      id: 21,
      taskId: 'task-21',
      provider: 'volcengine',
    },
  }])
  assert.deepEqual(patches, [{
    taskId: 'task-21',
    status: 'processing',
    updatedAt: 't2b',
  }])
})

runTest('buildJobFailurePatch normalizes unknown errors before persistence', () => {
  assert.equal(normalizeJobErrorMessage(new Error('provider rejected')), 'provider rejected')
  assert.equal(normalizeJobErrorMessage('plain failure'), 'plain failure')
  assert.deepEqual(
    buildJobFailurePatch(new Error('provider rejected'), 't3'),
    { status: 'failed', errorMsg: 'provider rejected', updatedAt: 't3' },
  )
})

runTest('recordMediaJobFailure logs normalized errors and persists failure patches', async () => {
  const logs: unknown[] = []
  const patches: unknown[] = []

  await recordMediaJobFailure({
    taskName: 'ImageTask',
    event: 'process',
    id: 7,
    provider: 'volcengine',
    error: new Error('provider rejected'),
    failedAt: 't4',
  }, {
    logError: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
    persistFailure: async (patch) => {
      patches.push(patch)
    },
  })

  assert.deepEqual(logs, [{
    taskName: 'ImageTask',
    event: 'process',
    payload: {
      id: 7,
      provider: 'volcengine',
      error: 'provider rejected',
    },
  }])
  assert.deepEqual(patches, [{
    status: 'failed',
    errorMsg: 'provider rejected',
    updatedAt: 't4',
  }])
})

runTest('recordMediaJobTimeout logs timeout causes while persisting timeout-prefixed failures', async () => {
  const logs: unknown[] = []
  const patches: unknown[] = []

  await recordMediaJobTimeout({
    taskName: 'VideoTask',
    event: 'poll-timeout',
    id: 9,
    taskId: 'task-9',
    errorMessage: 'Polling attempts exhausted',
    failedAt: 't5',
  }, {
    logError: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
    persistFailure: async (patch) => {
      patches.push(patch)
    },
  })

  assert.deepEqual(logs, [{
    taskName: 'VideoTask',
    event: 'poll-timeout',
    payload: {
      id: 9,
      taskId: 'task-9',
      error: 'Polling attempts exhausted',
    },
  }])
  assert.deepEqual(patches, [{
    status: 'failed',
    errorMsg: 'Timeout: Polling attempts exhausted',
    updatedAt: 't5',
  }])
})

runTest('logDetachedMediaJobError logs normalized errors without persistence', () => {
  const logs: unknown[] = []

  logDetachedMediaJobError({
    taskName: 'ImageTask',
    event: 'process',
    id: 12,
    error: 'background failure',
  }, {
    logError: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
  })

  assert.deepEqual(logs, [{
    taskName: 'ImageTask',
    event: 'process',
    payload: {
      id: 12,
      error: 'background failure',
    },
  }])
})
