import assert from 'node:assert/strict'

import {
  buildImageGenerationEnqueueRecord,
  buildImageGenerationEnqueueStartContext,
  buildMediaGenerationEnqueuePayload,
  buildVideoGenerationEnqueueRecord,
  buildVideoGenerationEnqueueStartContext,
} from '../media/generation/media-generation-enqueue.js'
import type { AIConfig } from '../adapters/types.js'

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

const config: AIConfig = {
  provider: 'volcengine',
  model: 'seedream-pro',
  baseUrl: 'https://provider.example.com',
  apiKey: 'secret',
}

runTest('buildImageGenerationEnqueueRecord creates processing rows with AiDrama image defaults', () => {
  const record = buildImageGenerationEnqueueRecord({
    params: {
      storyboardId: 1,
      dramaId: 2,
      sceneId: 3,
      characterId: 4,
      prompt: 'Generate a cinematic frame',
      referenceImages: ['static/images/a.png', 'https://example.com/ref.png'],
      frameType: 'first_frame',
    },
    config,
    enqueuedAt: 't1',
  })

  assert.deepEqual(record, {
    storyboardId: 1,
    dramaId: 2,
    sceneId: 3,
    characterId: 4,
    prompt: 'Generate a cinematic frame',
    model: 'seedream-pro',
    provider: 'volcengine',
    size: '2K',
    frameType: 'first_frame',
    referenceImages: '["static/images/a.png","https://example.com/ref.png"]',
    status: 'processing',
    createdAt: 't1',
    updatedAt: 't1',
  })
})

runTest('buildImageGenerationEnqueueStartContext mirrors the image enqueue log payload', () => {
  assert.deepEqual(
    buildImageGenerationEnqueueStartContext({
      id: 10,
      params: {
        storyboardId: 1,
        sceneId: 3,
        characterId: 4,
        prompt: 'Generate a cinematic frame',
        model: 'custom-image-model',
        frameType: 'last_frame',
      },
      config,
    }),
    {
      id: 10,
      provider: 'volcengine',
      storyboardId: 1,
      sceneId: 3,
      characterId: 4,
      frameType: 'last_frame',
      model: 'custom-image-model',
    },
  )
})

runTest('buildVideoGenerationEnqueueRecord creates processing rows with AiDrama video defaults', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: {
      storyboardId: 5,
      dramaId: 6,
      prompt: 'Animate the scene',
      referenceImageUrls: ['static/images/a.png', 'static/images/b.png'],
      referenceVideoUrls: 'static/videos/source.mp4',
      referenceAudioUrls: ['static/audio/music.mp3'],
    },
    config,
    enqueuedAt: 't2',
  })

  assert.deepEqual(record, {
    storyboardId: 5,
    dramaId: 6,
    prompt: 'Animate the scene',
    model: 'seedream-pro',
    provider: 'volcengine',
    referenceMode: 'none',
    imageUrl: undefined,
    firstFrameUrl: undefined,
    lastFrameUrl: undefined,
    referenceImageUrls: '["static/images/a.png","static/images/b.png"]',
    referenceVideoUrls: '["static/videos/source.mp4"]',
    referenceAudioUrls: '["static/audio/music.mp3"]',
    duration: 5,
    aspectRatio: '16:9',
    defectCheckAttempt: undefined,
    defectCheckParentId: undefined,
    status: 'processing',
    createdAt: 't2',
    updatedAt: 't2',
  })
})

runTest('buildVideoGenerationEnqueueRecord includes owner user id when provided', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: {
      userId: 9,
      prompt: 'Animate the scene',
    },
    config,
    enqueuedAt: 't3',
  })

  assert.equal(record.userId, 9)
})

runTest('buildVideoGenerationEnqueueStartContext mirrors the video enqueue log payload', () => {
  assert.deepEqual(
    buildVideoGenerationEnqueueStartContext({
      id: 11,
      params: {
        storyboardId: 5,
        dramaId: 6,
        prompt: 'Animate the scene',
        referenceMode: 'first_last_frame',
        duration: 8,
      },
      config,
    }),
    {
      id: 11,
      provider: 'volcengine',
      storyboardId: 5,
      dramaId: 6,
      referenceMode: 'first_last_frame',
      duration: 8,
    },
  )
})

runTest('buildMediaGenerationEnqueuePayload records public config fields with original params', () => {
  const params = {
    prompt: 'Generate a cinematic frame',
    configId: 3,
  }

  assert.deepEqual(
    buildMediaGenerationEnqueuePayload({
      id: 12,
      config,
      params,
    }),
    {
      id: 12,
      config: {
        provider: 'volcengine',
        model: 'seedream-pro',
        baseUrl: 'https://provider.example.com',
      },
      params,
    },
  )
})

runTest('buildVideoGenerationEnqueueRecord forwards defectCheckAttempt and parentId', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: {
      prompt: 'p',
      model: 'm',
      defectCheckAttempt: 2,
      defectCheckParentId: 41,
    },
    config: { provider: 'ali', model: 'm', baseUrl: 'b', apiKey: 'k' },
    enqueuedAt: '2026-05-22T00:00:00Z',
  })
  const r = record as Record<string, unknown>
  assert.equal(r.defectCheckAttempt, 2)
  assert.equal(r.defectCheckParentId, 41)
})

runTest('buildVideoGenerationEnqueueRecord omits defect fields when not provided', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: { prompt: 'p', model: 'm' },
    config: { provider: 'ali', model: 'm', baseUrl: 'b', apiKey: 'k' },
    enqueuedAt: '2026-05-22T00:00:00Z',
  })
  const r = record as Record<string, unknown>
  assert.equal(r.defectCheckAttempt, undefined)
  assert.equal(r.defectCheckParentId, undefined)
})
