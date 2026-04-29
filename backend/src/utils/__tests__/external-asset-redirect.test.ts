import assert from 'node:assert/strict'

import { externalAssetRedirectUrl } from '../external-asset-redirect.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('externalAssetRedirectUrl restores malformed https image URLs', () => {
  assert.equal(
    externalAssetRedirectUrl('https://app.example.com/https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg?x=1'),
    'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg?x=1',
  )
})

runTest('externalAssetRedirectUrl restores malformed http video URLs', () => {
  assert.equal(
    externalAssetRedirectUrl('https://app.example.com/http://assets.example.com/seedance/videos/a.mp4'),
    'http://assets.example.com/seedance/videos/a.mp4',
  )
})

runTest('externalAssetRedirectUrl ignores non-asset external paths', () => {
  assert.equal(
    externalAssetRedirectUrl('https://app.example.com/https://example.com/login'),
    null,
  )
})
