import assert from 'node:assert/strict'

import {
  buildUploadResponsePayload,
} from '../upload-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildUploadResponsePayload exposes COS URL while preserving local path', () => {
  assert.deepEqual(
    buildUploadResponsePayload(
      'static/uploads/hero.jpg',
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/uploads/hero.jpg',
    ),
    {
      url: 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/uploads/hero.jpg',
      path: 'static/uploads/hero.jpg',
    },
  )
})

runTest('buildUploadResponsePayload falls back to static path without COS URL', () => {
  assert.deepEqual(
    buildUploadResponsePayload('static/uploads/hero.jpg', null),
    {
      url: '/static/uploads/hero.jpg',
      path: 'static/uploads/hero.jpg',
    },
  )
})
