import assert from 'node:assert/strict'

import {
  isProviderApiError,
  sendProviderJsonRequest,
} from '../media-provider-transport.js'

type ProviderFetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

type TestProviderFetch = (url: string, init: RequestInit) => Promise<ProviderFetchResponse>

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

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number; text?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
    text: async () => init.text ?? JSON.stringify(payload),
  }
}

runTest('sendProviderJsonRequest posts JSON body and returns parsed payload', async () => {
  const calls: Array<{ url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }> = []
  const fetchImpl: TestProviderFetch = async (url, init) => {
    calls.push({
      url,
      init: {
        method: init.method,
        headers: init.headers as Record<string, string>,
        body: init.body as string,
      },
    })
    return jsonResponse({ ok: true, id: 7 })
  }

  const result = await sendProviderJsonRequest({
    url: 'https://provider.example.com/generate',
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: { prompt: 'hello' },
    fetchImpl,
  })

  assert.deepEqual(result, { ok: true, id: 7 })
  assert.deepEqual(calls, [{
    url: 'https://provider.example.com/generate',
    init: {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: '{"prompt":"hello"}',
    },
  }])
})

runTest('sendProviderJsonRequest can omit request body for poll calls', async () => {
  const calls: Array<{ body: unknown }> = []
  const fetchImpl: TestProviderFetch = async (_url, init) => {
    calls.push({ body: init.body })
    return jsonResponse({ status: 'completed' })
  }

  const result = await sendProviderJsonRequest({
    url: 'https://provider.example.com/task/1',
    method: 'GET',
    headers: {},
    fetchImpl,
  })

  assert.deepEqual(result, { status: 'completed' })
  assert.deepEqual(calls, [{ body: undefined }])
})

runTest('sendProviderJsonRequest throws stable provider API errors', async () => {
  const fetchImpl: TestProviderFetch = async () => jsonResponse(
    { error: 'bad request' },
    { ok: false, status: 422, text: 'bad request body' },
  )

  try {
    await sendProviderJsonRequest({
      url: 'https://provider.example.com/generate',
      method: 'POST',
      headers: {},
      body: { prompt: 'bad' },
      fetchImpl,
    })
    assert.fail('Expected provider API error')
  } catch (error) {
    assert.equal(isProviderApiError(error), true)
    assert.match((error as Error).message, /API error 422: bad request body/)
  }
})

runTest('sendProviderJsonRequest applies a timeout signal when requested', async () => {
  const calls: Array<{ hasSignal: boolean }> = []
  const fetchImpl: TestProviderFetch = async (_url, init) => {
    calls.push({ hasSignal: Boolean(init.signal) })
    return jsonResponse({ ok: true })
  }

  await sendProviderJsonRequest({
    url: 'https://provider.example.com/generate',
    method: 'POST',
    headers: {},
    body: { prompt: 'hello' },
    timeoutMs: 1000,
    fetchImpl,
  })

  assert.deepEqual(calls, [{ hasSignal: true }])
})
