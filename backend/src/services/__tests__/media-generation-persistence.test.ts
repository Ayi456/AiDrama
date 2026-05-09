import assert from 'node:assert/strict'

import {
  createImageGenerationPersistence,
  createVideoGenerationPersistence,
} from '../media/generation/media-generation-persistence.js'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('image generation persistence forwards job patches and owner publication patches', async () => {
  const calls: unknown[] = []
  const persistence = createImageGenerationPersistence(11, {
    persistImageGenerationPatch: async (id, patch) => {
      calls.push({ channel: 'image', id, patch })
    },
    persistVideoGenerationPatch: async () => assert.fail('image persistence should not update video generations'),
    publishStoryboardPatch: async (id, patch) => {
      calls.push({ channel: 'storyboard', id, patch })
    },
    publishCharacterPatch: async (id, patch) => {
      calls.push({ channel: 'character', id, patch })
    },
    publishScenePatch: async (id, patch) => {
      calls.push({ channel: 'scene', id, patch })
    },
  })

  await persistence.persistSnapshot('providerRequest', { prompt: 'shot' }, 't1')
  await persistence.persistProcessing({ taskId: 'task-11', status: 'processing', updatedAt: 't2' })
  await persistence.persistFailure({ status: 'failed', errorMsg: 'bad provider', updatedAt: 't3' })
  await persistence.persistImageCompletion({ imageUrl: 'cos://image.png', status: 'completed', updatedAt: 't4' })
  await persistence.publishStoryboardImage(21, { firstFrameImage: 'cos://image.png', updatedAt: 't5' })
  await persistence.publishCharacterImage(31, { imageUrl: 'cos://image.png', updatedAt: 't6' })
  await persistence.publishSceneImage(41, { imageUrl: 'cos://image.png', status: 'completed', updatedAt: 't7' })

  assert.deepEqual(calls, [
    { channel: 'image', id: 11, patch: { providerRequest: '{"prompt":"shot"}', updatedAt: 't1' } },
    { channel: 'image', id: 11, patch: { taskId: 'task-11', status: 'processing', updatedAt: 't2' } },
    { channel: 'image', id: 11, patch: { status: 'failed', errorMsg: 'bad provider', updatedAt: 't3' } },
    { channel: 'image', id: 11, patch: { imageUrl: 'cos://image.png', status: 'completed', updatedAt: 't4' } },
    { channel: 'storyboard', id: 21, patch: { firstFrameImage: 'cos://image.png', updatedAt: 't5' } },
    { channel: 'character', id: 31, patch: { imageUrl: 'cos://image.png', updatedAt: 't6' } },
    { channel: 'scene', id: 41, patch: { imageUrl: 'cos://image.png', status: 'completed', updatedAt: 't7' } },
  ])
})

await runTest('video generation persistence forwards job patches and storyboard publication patches', async () => {
  const calls: unknown[] = []
  const persistence = createVideoGenerationPersistence(12, {
    persistImageGenerationPatch: async () => assert.fail('video persistence should not update image generations'),
    persistVideoGenerationPatch: async (id, patch) => {
      calls.push({ channel: 'video', id, patch })
    },
    publishStoryboardPatch: async (id, patch) => {
      calls.push({ channel: 'storyboard', id, patch })
    },
    publishCharacterPatch: async () => assert.fail('video persistence should not publish character images'),
    publishScenePatch: async () => assert.fail('video persistence should not publish scene images'),
  })

  await persistence.persistSnapshot('providerResponse', { status: 'ok' }, 'v1')
  await persistence.persistProcessing({ taskId: 'task-12', status: 'processing', updatedAt: 'v2' })
  await persistence.persistFailure({ status: 'failed', errorMsg: 'timeout', updatedAt: 'v3' })
  await persistence.persistVideoCompletion({ videoUrl: 'cos://video.mp4', status: 'completed', updatedAt: 'v4', completedAt: 'v4' })
  await persistence.publishStoryboardVideo(22, { videoUrl: 'cos://video.mp4', duration: 8, updatedAt: 'v5' })

  assert.deepEqual(calls, [
    { channel: 'video', id: 12, patch: { providerResponse: '{"status":"ok"}', updatedAt: 'v1' } },
    { channel: 'video', id: 12, patch: { taskId: 'task-12', status: 'processing', updatedAt: 'v2' } },
    { channel: 'video', id: 12, patch: { status: 'failed', errorMsg: 'timeout', updatedAt: 'v3' } },
    { channel: 'video', id: 12, patch: { videoUrl: 'cos://video.mp4', status: 'completed', updatedAt: 'v4', completedAt: 'v4' } },
    { channel: 'storyboard', id: 22, patch: { videoUrl: 'cos://video.mp4', duration: 8, updatedAt: 'v5' } },
  ])
})
