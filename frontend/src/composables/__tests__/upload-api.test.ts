import assert from 'node:assert/strict'

import { uploadAPI } from '../../api/auth.ts'
import { normalizeApiErrorMessage } from '../../api/errors.ts'
import { uploadAPI as facadeUploadAPI } from '../useApi.ts'

assert.strictEqual(facadeUploadAPI, uploadAPI)

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('uploadAPI.image uploads images through a direct COS target before falling back to SCF multipart', async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method, body: init?.body })
    if (url === '/api/v1/upload/image/direct') {
      return jsonResponse(200, {
        data: {
          upload_url: 'https://cos.example.com/seedream/uploads/a.jpg?sign=1',
          url: 'https://cos.example.com/seedream/uploads/a.jpg',
          path: 'static/uploads/a.jpg',
          headers: { 'Content-Type': 'image/jpeg' },
        },
      })
    }
    if (url === 'https://cos.example.com/seedream/uploads/a.jpg?sign=1') {
      return new Response('', { status: 200 })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }

  try {
    const file = new File(['image-bytes'], 'a.jpg', { type: 'image/jpeg' })
    const uploaded = await uploadAPI.image(file)

    assert.deepEqual(uploaded, {
      url: 'https://cos.example.com/seedream/uploads/a.jpg',
      path: 'static/uploads/a.jpg',
    })
    assert.deepEqual(
      calls.map(call => [call.url, call.method]),
      [
        ['/api/v1/upload/image/direct', 'POST'],
        ['https://cos.example.com/seedream/uploads/a.jpg?sign=1', 'PUT'],
      ],
    )
    assert.equal(calls.some(call => call.url === '/api/v1/upload/image'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

await runTest('normalizeApiErrorMessage makes provider safety errors user-readable', async () => {
  const message = normalizeApiErrorMessage(
    'API error 400: {"error":{"code":"InputImageSensitiveContentDetected.P","message":"The request failed because the input image may contain real person. Request id: 0217808837142934087c9e55f8b322b82cd17f72450d06edd0fa0","param":"","type":"BadRequest"}}',
  )

  assert.equal(message, '图片审核未通过：参考图可能包含真实人物或敏感内容，请更换参考图，或改用文字生成。')
})

await runTest('uploadAPI.image falls back to multipart when direct upload is not configured', async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method, body: init?.body })
    if (url === '/api/v1/upload/image/direct') {
      return jsonResponse(400, {
        code: 400,
        message: 'COS direct upload is not configured',
      })
    }
    if (url === '/api/v1/upload/image') {
      return jsonResponse(200, {
        data: {
          url: '/static/uploads/a.jpg',
          path: 'static/uploads/a.jpg',
        },
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }

  try {
    const file = new File(['image-bytes'], 'a.jpg', { type: 'image/jpeg' })
    const uploaded = await uploadAPI.image(file)

    assert.deepEqual(uploaded, {
      url: '/static/uploads/a.jpg',
      path: 'static/uploads/a.jpg',
    })
    assert.deepEqual(
      calls.map(call => [call.url, call.method]),
      [
        ['/api/v1/upload/image/direct', 'POST'],
        ['/api/v1/upload/image', 'POST'],
      ],
    )
    assert.ok(calls[1]!.body instanceof FormData)
  } finally {
    globalThis.fetch = originalFetch
  }
})
