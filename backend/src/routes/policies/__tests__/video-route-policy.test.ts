import assert from 'node:assert/strict'

import {
  buildVideoGenerationInput,
  buildVideoRouteLogContext,
  errorMessageFromUnknown,
  presentEffectiveVideoGenerationAsset,
  validateVideoGenerateBody,
} from '../video-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('validateVideoGenerateBody preserves prompt-required validation', () => {
  assert.equal(validateVideoGenerateBody({}), 'prompt is required')
  assert.equal(validateVideoGenerateBody({ prompt: '' }), 'prompt is required')
  assert.equal(validateVideoGenerateBody({ prompt: 'camera follows the hero' }), null)
})

runTest('buildVideoGenerationInput maps route body into generation params', () => {
  const input = buildVideoGenerationInput(
    {
      storyboard_id: 11,
      drama_id: 3,
      prompt: 'camera follows the hero',
      model: 'video-model',
      reference_mode: 'first_last',
      image_url: 'https://cdn.example.com/image.png',
      first_frame_url: 'https://cdn.example.com/first.png',
      last_frame_url: 'https://cdn.example.com/last.png',
      reference_image_urls: ['https://cdn.example.com/ref.png'],
      reference_video_urls: 'https://cdn.example.com/ref.mp4',
      reference_audio_urls: ['https://cdn.example.com/ref.mp3'],
      duration: 8,
      aspect_ratio: '9:16',
    },
    77,
  )

  assert.deepEqual(input, {
    storyboardId: 11,
    dramaId: 3,
    prompt: 'camera follows the hero',
    model: 'video-model',
    referenceMode: 'first_last',
    imageUrl: 'https://cdn.example.com/image.png',
    firstFrameUrl: 'https://cdn.example.com/first.png',
    lastFrameUrl: 'https://cdn.example.com/last.png',
    referenceImageUrls: ['https://cdn.example.com/ref.png'],
    referenceVideoUrls: 'https://cdn.example.com/ref.mp4',
    referenceAudioUrls: ['https://cdn.example.com/ref.mp3'],
    duration: 8,
    aspectRatio: '9:16',
    configId: 77,
  })
})

runTest('buildVideoRouteLogContext exposes route-owned log fields', () => {
  const context = buildVideoRouteLogContext({
    storyboard_id: 11,
    drama_id: 3,
    reference_mode: 'first_last',
    duration: 8,
  })

  assert.deepEqual(context, {
    storyboardId: 11,
    dramaId: 3,
    referenceMode: 'first_last',
    duration: 8,
  })
})

runTest('errorMessageFromUnknown normalizes thrown values without any', () => {
  assert.equal(errorMessageFromUnknown(new Error('provider failed')), 'provider failed')
  assert.equal(errorMessageFromUnknown('string failure'), 'string failure')
  assert.equal(errorMessageFromUnknown({ message: 'not trusted' }), 'Unknown video generation error')
})

runTest('presentEffectiveVideoGenerationAsset exposes processing regeneration as the effective task', () => {
  const result = presentEffectiveVideoGenerationAsset(
    {
      id: 41,
      status: 'failed_defect',
      videoUrl: 'https://cdn.example.com/old.mp4',
    },
    {
      id: 42,
      status: 'processing',
      taskId: 'regen-task',
    },
  )

  assert.equal(result.id, 41)
  assert.equal(result.status, 'processing')
  assert.equal(result.originalStatus, 'failed_defect')
  assert.equal(result.original_status, 'failed_defect')
  assert.equal(result.effectiveStatus, 'processing')
  assert.equal(result.effective_status, 'processing')
  assert.equal(result.regenerationId, 42)
  assert.equal(result.regeneration_id, 42)
  assert.equal(result.effectiveGenerationId, 42)
  assert.equal(result.taskId, 'regen-task')
  assert.equal(result.task_id, 'regen-task')
})

runTest('presentEffectiveVideoGenerationAsset exposes completed regeneration video url aliases', () => {
  const result = presentEffectiveVideoGenerationAsset(
    {
      id: 51,
      status: 'failed_defect',
      videoUrl: 'https://cdn.example.com/old-provider.mp4',
      minioUrl: 'https://cdn.example.com/old.mp4',
    },
    {
      id: 52,
      status: 'completed',
      videoUrl: 'https://cdn.example.com/new-provider.mp4',
      minioUrl: 'https://cdn.example.com/new.mp4',
      completedAt: '2026-01-01T00:00:00.000Z',
    },
  )

  assert.equal(result.status, 'completed')
  assert.equal(result.videoUrl, 'https://cdn.example.com/new.mp4')
  assert.equal(result.video_url, 'https://cdn.example.com/new.mp4')
  assert.equal(result.publicUrl, 'https://cdn.example.com/new.mp4')
  assert.equal(result.effectiveVideoUrl, 'https://cdn.example.com/new.mp4')
  assert.equal(result.effective_video_url, 'https://cdn.example.com/new.mp4')
  assert.equal(result.providerVideoUrl, 'https://cdn.example.com/new-provider.mp4')
  assert.equal(result.completedAt, '2026-01-01T00:00:00.000Z')
})

runTest('presentEffectiveVideoGenerationAsset does not reuse parent urls for an incomplete regeneration', () => {
  const result = presentEffectiveVideoGenerationAsset(
    {
      id: 55,
      status: 'failed_defect',
      videoUrl: 'https://cdn.example.com/old-provider.mp4',
      minioUrl: 'https://cdn.example.com/old.mp4',
    },
    {
      id: 56,
      status: 'completed',
    },
  )

  assert.equal(result.status, 'completed')
  assert.equal(result.videoUrl, '')
  assert.equal(result.video_url, '')
  assert.equal(result.publicUrl, '')
  assert.equal(result.public_url, '')
  assert.equal(result.effectiveVideoUrl, undefined)
  assert.equal(result.effective_video_url, undefined)
})

runTest('presentEffectiveVideoGenerationAsset exposes failed regeneration error message', () => {
  const result = presentEffectiveVideoGenerationAsset(
    {
      id: 61,
      status: 'failed_defect',
      errorMsg: 'old defect',
    },
    {
      id: 62,
      status: 'failed',
      errorMsg: 'provider failed',
    },
  )

  assert.equal(result.status, 'failed')
  assert.equal(result.errorMsg, 'provider failed')
  assert.equal(result.error_msg, 'provider failed')
  assert.equal(result.effectiveErrorMsg, 'provider failed')
  assert.equal(result.effective_error_msg, 'provider failed')
})
