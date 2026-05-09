import assert from 'node:assert/strict'

import {
  prepareProviderGenerationAttempt,
  prepareProviderPollAttempt,
  submitProviderGenerationRequest,
  submitProviderPollAttempt,
} from '../media/provider/media-provider-execution.js'

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

runTest('prepareProviderGenerationAttempt builds redacted request log context and raw payload context', () => {
  const prepared = prepareProviderGenerationAttempt({
    id: 9,
    config: {
      provider: 'volcengine',
      baseUrl: 'https://provider.example.com',
      apiKey: 'secret',
      model: 'seedream',
    },
    providerRequest: {
      url: 'https://provider.example.com/generate?token=secret',
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: { prompt: 'hello' },
    },
    extraLogContext: {
      model: 'custom-model',
      referenceMode: 'first_frame',
    },
    redactUrl: (url) => url.replace('secret', '***'),
  })

  assert.deepEqual(prepared.requestLogContext, {
    id: 9,
    provider: 'volcengine',
    method: 'POST',
    url: 'https://provider.example.com/generate?token=***',
    model: 'custom-model',
    referenceMode: 'first_frame',
  })
  assert.deepEqual(prepared.requestPayload, {
    id: 9,
    method: 'POST',
    url: 'https://provider.example.com/generate?token=secret',
    headers: { Authorization: 'Bearer secret' },
    body: { prompt: 'hello' },
  })
})

runTest('submitProviderGenerationRequest snapshots provider exchange and returns parsed result', async () => {
  let tick = 0
  const snapshots: Array<{ field: string; payload: unknown; timestamp: string }> = []
  const sentRequests: unknown[] = []

  const result = await submitProviderGenerationRequest({
    normalizedSpec: { kind: 'image', prompt: 'hello' },
    providerRequest: {
      url: 'https://provider.example.com/generate',
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: { prompt: 'hello' },
    },
    timeoutMs: 600_000,
  }, {
    now: () => `t${++tick}`,
    persistSnapshot: async (field, payload, timestamp) => {
      snapshots.push({ field, payload, timestamp })
    },
    sendJsonRequest: async (request) => {
      sentRequests.push(request)
      return { taskId: 'task-1' }
    },
  })

  assert.deepEqual(result, { taskId: 'task-1' })
  assert.deepEqual(sentRequests, [{
    url: 'https://provider.example.com/generate',
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { prompt: 'hello' },
    timeoutMs: 600_000,
  }])
  assert.deepEqual(snapshots, [
    {
      field: 'normalizedRequest',
      payload: { kind: 'image', prompt: 'hello' },
      timestamp: 't1',
    },
    {
      field: 'providerRequest',
      payload: { prompt: 'hello' },
      timestamp: 't2',
    },
    {
      field: 'providerResponse',
      payload: { taskId: 'task-1' },
      timestamp: 't3',
    },
  ])
})

runTest('prepareProviderPollAttempt builds provider request and redacted poll log context', () => {
  const calls: Array<{ provider: string; taskId: string }> = []
  const prepared = prepareProviderPollAttempt({
    id: 7,
    taskId: 'task-7',
    attemptNumber: 3,
    config: {
      provider: 'volcengine',
      baseUrl: 'https://provider.example.com',
      apiKey: 'secret',
      model: 'seedance',
    },
    adapter: {
      buildPollRequest: (config, taskId) => {
        calls.push({ provider: config.provider, taskId })
        return {
          url: 'https://provider.example.com/tasks/task-7?token=secret',
          method: 'GET',
          headers: { Authorization: 'Bearer secret' },
          body: { ignored: true },
        }
      },
    },
    redactUrl: (url) => url.replace('secret', '***'),
  })

  assert.deepEqual(calls, [{ provider: 'volcengine', taskId: 'task-7' }])
  assert.deepEqual(prepared.providerRequest, {
    url: 'https://provider.example.com/tasks/task-7?token=secret',
    method: 'GET',
    headers: { Authorization: 'Bearer secret' },
  })
  assert.deepEqual(prepared.logContext, {
    id: 7,
    taskId: 'task-7',
    provider: 'volcengine',
    method: 'GET',
    url: 'https://provider.example.com/tasks/task-7?token=***',
    attempt: 3,
  })
})

runTest('submitProviderPollAttempt snapshots successful poll responses', async () => {
  const snapshots: Array<{ field: string; payload: unknown; timestamp: string }> = []
  const sentRequests: unknown[] = []

  const result = await submitProviderPollAttempt({
    providerRequest: {
      url: 'https://provider.example.com/tasks/task-1',
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    },
    timeoutMs: 30_000,
  }, {
    now: () => 'poll-t1',
    isProviderApiError: () => false,
    persistSnapshot: async (field, payload, timestamp) => {
      snapshots.push({ field, payload, timestamp })
    },
    sendJsonRequest: async (request) => {
      sentRequests.push(request)
      return { status: 'completed', imageUrl: 'https://provider.example.com/image.png' }
    },
  })

  assert.deepEqual(result, {
    type: 'response',
    result: { status: 'completed', imageUrl: 'https://provider.example.com/image.png' },
  })
  assert.deepEqual(sentRequests, [{
    url: 'https://provider.example.com/tasks/task-1',
    method: 'GET',
    headers: { Authorization: 'Bearer token' },
    timeoutMs: 30_000,
  }])
  assert.deepEqual(snapshots, [{
    field: 'providerResponse',
    payload: { status: 'completed', imageUrl: 'https://provider.example.com/image.png' },
    timestamp: 'poll-t1',
  }])
})

runTest('submitProviderPollAttempt continues when provider API errors are retryable', async () => {
  const snapshots: Array<{ field: string; payload: unknown; timestamp: string }> = []
  const providerError = new Error('API error 429: rate limited')

  const result = await submitProviderPollAttempt({
    providerRequest: {
      url: 'https://provider.example.com/tasks/task-1',
      method: 'GET',
      headers: {},
    },
  }, {
    now: () => 'poll-t2',
    isProviderApiError: (error) => error === providerError,
    persistSnapshot: async (field, payload, timestamp) => {
      snapshots.push({ field, payload, timestamp })
    },
    sendJsonRequest: async () => {
      throw providerError
    },
  })

  assert.deepEqual(result, { type: 'continue' })
  assert.deepEqual(snapshots, [])
})
