import assert from 'node:assert/strict'

import {
  buildDirectUploadResponsePayload,
  buildUploadResponsePayload,
  buildUploadedStaticPath,
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

runTest('buildUploadedStaticPath creates stable static upload paths', () => {
  assert.equal(
    buildUploadedStaticPath('uploads', 'Hero Scene.PNG', 'abc-123'),
    'static/uploads/abc-123.png',
  )
})

runTest('buildDirectUploadResponsePayload exposes direct PUT target and final public URL', () => {
  assert.deepEqual(
    buildDirectUploadResponsePayload({
      savedPath: 'static/uploads/hero.jpg',
      publicUrl: 'https://cos.example.com/seedream/uploads/hero.jpg',
      uploadUrl: 'https://cos.example.com/seedream/uploads/hero.jpg?sign=1',
      contentType: 'image/jpeg',
    }),
    {
      url: 'https://cos.example.com/seedream/uploads/hero.jpg',
      path: 'static/uploads/hero.jpg',
      upload_url: 'https://cos.example.com/seedream/uploads/hero.jpg?sign=1',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    },
  )
})
