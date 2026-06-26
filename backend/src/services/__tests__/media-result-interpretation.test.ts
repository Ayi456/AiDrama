import assert from 'node:assert/strict'

import {
  interpretImageGenerateResult,
  interpretImagePollResult,
  interpretVideoGenerateResult,
  interpretVideoPollResult,
} from '../media/request/media-result-interpretation.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('interpretImageGenerateResult classifies sync URL, sync base64, and async results', () => {
  const adapter = {
    parseGenerateResponse: (result: any) => result,
    extractImageBase64: (result: any) => result.base64 ?? null,
  }

  assert.deepEqual(
    interpretImageGenerateResult(adapter, { isAsync: false, imageUrl: 'https://cdn.example.com/a.png' }),
    { type: 'completed-url', imageUrl: 'https://cdn.example.com/a.png' },
  )
  assert.deepEqual(
    interpretImageGenerateResult(adapter, {
      isAsync: false,
      base64: { data: 'raw-image', mimeType: 'image/png' },
    }),
    { type: 'completed-base64', data: 'raw-image', mimeType: 'image/png' },
  )
  assert.deepEqual(
    interpretImageGenerateResult(adapter, { isAsync: true, taskId: 'task-1' }),
    { type: 'async', taskId: 'task-1' },
  )
})

runTest('interpretImageGenerateResult reports missing sync image payloads', () => {
  const adapter = {
    parseGenerateResponse: (result: any) => result,
    extractImageBase64: () => null,
  }

  assert.deepEqual(
    interpretImageGenerateResult(adapter, { isAsync: false }),
    { type: 'missing-output', message: 'No image URL or base64 data in response' },
  )
})

runTest('interpretImageGenerateResult reports missing async task ids', () => {
  const adapter = {
    parseGenerateResponse: (result: any) => result,
    extractImageBase64: () => null,
  }

  assert.deepEqual(
    interpretImageGenerateResult(adapter, { isAsync: true }),
    { type: 'missing-output', message: 'Async image response did not include taskId' },
  )
})

runTest('interpretImagePollResult preserves Gemini base64 behavior and failed errors', () => {
  const adapter = {
    provider: 'gemini',
    parsePollResponse: (result: any) => result,
    extractImageBase64: (result: any) => result.base64 ?? null,
  }

  assert.deepEqual(
    interpretImagePollResult(adapter, {
      status: 'completed',
      base64: { data: 'raw-image', mimeType: 'image/jpeg' },
    }),
    { type: 'completed-base64', data: 'raw-image', mimeType: 'image/jpeg' },
  )
  assert.deepEqual(
    interpretImagePollResult(adapter, { status: 'failed' }),
    { type: 'failed', error: 'Generation failed' },
  )
})

runTest('interpretVideoGenerateResult and interpretVideoPollResult classify video outcomes', () => {
  const adapter = {
    parseGenerateResponse: (result: any) => result,
    parsePollResponse: (result: any) => result,
  }
  const providerUsage = {
    completionTokens: 108900,
    totalTokens: 108900,
    raw: { completion_tokens: 108900, total_tokens: 108900 },
  }

  assert.deepEqual(
    interpretVideoGenerateResult(adapter, { isAsync: false, videoUrl: 'https://cdn.example.com/a.mp4' }),
    { type: 'completed-url', videoUrl: 'https://cdn.example.com/a.mp4' },
  )
  assert.deepEqual(
    interpretVideoGenerateResult(adapter, { isAsync: true, taskId: 'task-2' }),
    { type: 'async', taskId: 'task-2' },
  )
  assert.deepEqual(
    interpretVideoPollResult(adapter, {
      status: 'completed',
      videoUrl: 'https://cdn.example.com/a.mp4',
      providerUsage,
    }),
    { type: 'completed-url', videoUrl: 'https://cdn.example.com/a.mp4', providerUsage },
  )
  assert.deepEqual(
    interpretVideoPollResult(adapter, { status: 'failed' }),
    { type: 'failed', error: 'Video generation failed' },
  )
})

runTest('interpretVideoGenerateResult reports missing generate outputs', () => {
  const adapter = {
    parseGenerateResponse: (result: any) => result,
  }

  assert.deepEqual(
    interpretVideoGenerateResult(adapter, { isAsync: false }),
    { type: 'missing-output', message: 'No video URL in response' },
  )
  assert.deepEqual(
    interpretVideoGenerateResult(adapter, { isAsync: true }),
    { type: 'missing-output', message: 'Async video response did not include taskId' },
  )
})
