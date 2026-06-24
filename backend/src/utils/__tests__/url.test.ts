import assert from 'node:assert/strict'

import { isHttpUrl } from '../url.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('isHttpUrl recognizes HTTP and HTTPS URLs only', () => {
  assert.equal(isHttpUrl('https://cdn.example.com/video.mp4'), true)
  assert.equal(isHttpUrl('HTTP://cdn.example.com/video.mp4'), true)
  assert.equal(isHttpUrl('static/videos/a.mp4'), false)
  assert.equal(isHttpUrl('data:video/mp4;base64,AAAA'), false)
  assert.equal(isHttpUrl(''), false)
})
