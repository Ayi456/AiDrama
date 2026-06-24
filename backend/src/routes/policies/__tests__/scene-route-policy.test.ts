import assert from 'node:assert/strict'

import {
  buildSceneCreateValues,
  buildSceneUpdatePatch,
  needsSceneUpdateLocationFallback,
  readSceneCreateInput,
} from '../scene-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('readSceneCreateInput reads id aliases and primary text fields', () => {
  assert.deepEqual(readSceneCreateInput({
    drama_id: '12',
    episodeId: 3,
    location: '  Rooftop  ',
    imageUrl: '  /static/scene.png  ',
  }), {
    dramaId: 12,
    episodeId: 3,
    location: 'Rooftop',
    imageUrl: '/static/scene.png',
  })
})

runTest('buildSceneCreateValues applies prompt fallback and default status', () => {
  assert.deepEqual(buildSceneCreateValues({
    time: '  night  ',
    prompt: '',
    local_path: '  static/scene.png  ',
    referenceImage: '  /static/reference.png  ',
  }, {
    dramaId: 8,
    episodeId: 0,
    location: 'Library',
    imageUrl: '',
  }, '2026-06-24T00:00:00.000Z'), {
    dramaId: 8,
    episodeId: null,
    location: 'Library',
    time: 'night',
    prompt: 'Library',
    imageUrl: null,
    localPath: 'static/scene.png',
    referenceImage: '/static/reference.png',
    status: 'pending',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  })
})

runTest('buildSceneCreateValues marks scenes with an image source as completed by default', () => {
  assert.equal(buildSceneCreateValues({}, {
    dramaId: 8,
    episodeId: 2,
    location: 'Library',
    imageUrl: '/static/scene.png',
  }, '2026-06-24T00:00:00.000Z').status, 'completed')
})

runTest('needsSceneUpdateLocationFallback only asks the route for DB state when prompt lacks a string location', () => {
  assert.equal(needsSceneUpdateLocationFallback({ prompt: '' }), true)
  assert.equal(needsSceneUpdateLocationFallback({ prompt: '', location: 'Rooftop' }), false)
  assert.equal(needsSceneUpdateLocationFallback({ prompt: '', location: null }), true)
  assert.equal(needsSceneUpdateLocationFallback({ location: 'Rooftop' }), false)
})

runTest('buildSceneUpdatePatch keeps alias overwrite behavior and prompt fallback', () => {
  assert.deepEqual(buildSceneUpdatePatch({
    prompt: '',
    image_url: 'snake url',
    imageUrl: 'camel url',
    local_path: 'snake local',
    localPath: 'camel local',
    reference_image: 'snake reference',
    referenceImage: 'camel reference',
  }, '2026-06-24T00:01:00.000Z', 'Library'), {
    updatedAt: '2026-06-24T00:01:00.000Z',
    prompt: 'Library',
    imageUrl: 'camel url',
    localPath: 'camel local',
    referenceImage: 'camel reference',
  })
})

runTest('buildSceneUpdatePatch uses a provided location as prompt fallback before DB state', () => {
  assert.deepEqual(buildSceneUpdatePatch({
    location: 'Rooftop',
    prompt: '',
  }, '2026-06-24T00:02:00.000Z', 'Library'), {
    updatedAt: '2026-06-24T00:02:00.000Z',
    location: 'Rooftop',
    prompt: 'Rooftop',
  })
})
