import assert from 'node:assert/strict'

import {
  buildVideoGenerationInput,
  buildVideoRouteLogContext,
  errorMessageFromUnknown,
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
