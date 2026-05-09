import assert from 'node:assert/strict'

import {
  buildCharacterImagePatch,
  buildSceneImagePatch,
  buildStoryboardImagePatch,
  buildStoryboardVideoPatch,
} from '../media/assets/media-publication.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildStoryboardImagePatch routes first and last frames to dedicated fields', () => {
  assert.deepEqual(
    buildStoryboardImagePatch('first_frame', 'static/images/first.png', 't1'),
    { firstFrameImage: 'static/images/first.png', updatedAt: 't1' },
  )
  assert.deepEqual(
    buildStoryboardImagePatch('last_frame', 'static/images/last.png', 't2'),
    { lastFrameImage: 'static/images/last.png', updatedAt: 't2' },
  )
})

runTest('buildStoryboardImagePatch treats unknown frame types as composed images', () => {
  assert.deepEqual(
    buildStoryboardImagePatch('grid', 'static/images/grid.png', 't3'),
    { composedImage: 'static/images/grid.png', updatedAt: 't3' },
  )
  assert.deepEqual(
    buildStoryboardImagePatch(null, 'static/images/default.png', 't4'),
    { composedImage: 'static/images/default.png', updatedAt: 't4' },
  )
})

runTest('buildStoryboardVideoPatch omits empty durations and preserves positive durations', () => {
  assert.deepEqual(
    buildStoryboardVideoPatch('static/videos/shot.mp4', 12, 't5'),
    { videoUrl: 'static/videos/shot.mp4', duration: 12, updatedAt: 't5' },
  )
  assert.deepEqual(
    buildStoryboardVideoPatch('static/videos/shot.mp4', 0, 't6'),
    { videoUrl: 'static/videos/shot.mp4', duration: undefined, updatedAt: 't6' },
  )
})

runTest('buildCharacterImagePatch publishes generated portraits without workflow status', () => {
  assert.deepEqual(
    buildCharacterImagePatch('static/images/character.png', 'data/images/character.png', 't7'),
    {
      imageUrl: 'static/images/character.png',
      localPath: 'data/images/character.png',
      updatedAt: 't7',
    },
  )
})

runTest('buildSceneImagePatch marks generated scene artwork as completed', () => {
  assert.deepEqual(
    buildSceneImagePatch('static/images/scene.png', 'data/images/scene.png', 't8'),
    {
      imageUrl: 'static/images/scene.png',
      localPath: 'data/images/scene.png',
      status: 'completed',
      updatedAt: 't8',
    },
  )
})
