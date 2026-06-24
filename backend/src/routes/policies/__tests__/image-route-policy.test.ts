import assert from 'node:assert/strict'

import {
  buildImageGenerationInput,
  buildImageRouteLogContext,
  readImageOwnershipIds,
  readImageRequestedConfigId,
  validateImageGenerateBody,
} from '../image-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('validateImageGenerateBody preserves prompt and owner validation order', () => {
  assert.equal(validateImageGenerateBody({}), 'prompt is required')
  assert.equal(validateImageGenerateBody({ prompt: '' }), 'prompt is required')
  assert.equal(validateImageGenerateBody({ prompt: 'wide establishing shot' }), 'drama_id, storyboard_id, scene_id, or character_id is required')
  assert.equal(validateImageGenerateBody({ prompt: 'wide establishing shot', storyboard_id: 11 }), null)
})

runTest('readImageOwnershipIds keeps string ids available for ownership checks', () => {
  assert.deepEqual(readImageOwnershipIds({
    drama_id: '3',
    storyboard_id: 11,
    scene_id: '7',
    character_id: 5,
  }), {
    dramaId: 3,
    storyboardId: 11,
    sceneId: 7,
    characterId: 5,
  })
})

runTest('buildImageGenerationInput maps only generation-owned typed fields', () => {
  const input = buildImageGenerationInput(
    {
      drama_id: 3,
      storyboard_id: '11',
      scene_id: 7,
      character_id: 5,
      prompt: 'hero enters the neon market',
      model: 'image-model',
      size: '1024x1024',
      reference_images: ['https://cdn.example.com/ref.png'],
      frame_type: 'first',
    },
    77,
  )

  assert.deepEqual(input, {
    storyboardId: undefined,
    dramaId: 3,
    sceneId: 7,
    characterId: 5,
    prompt: 'hero enters the neon market',
    model: 'image-model',
    size: '1024x1024',
    referenceImages: ['https://cdn.example.com/ref.png'],
    frameType: 'first',
    configId: 77,
  })
})

runTest('buildImageRouteLogContext exposes raw route-owned log fields', () => {
  assert.deepEqual(buildImageRouteLogContext({
    storyboard_id: '11',
    scene_id: 7,
    character_id: 5,
    drama_id: 3,
    frame_type: 'last',
  }), {
    storyboardId: '11',
    sceneId: 7,
    characterId: 5,
    dramaId: 3,
    frameType: 'last',
  })
})

runTest('readImageRequestedConfigId preserves numeric config id handling', () => {
  assert.equal(readImageRequestedConfigId({ config_id: 12 }), 12)
  assert.equal(readImageRequestedConfigId({ config_id: '12' }), undefined)
  assert.equal(readImageRequestedConfigId({}), undefined)
})
