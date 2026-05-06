import assert from 'node:assert/strict'

import {
  redirectAssetProxyTarget,
  isAllowedAssetProxyTarget,
  shouldRedirectAssetProxyTarget,
} from '../asset-proxy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const config = {
  secretId: 'id',
  secretKey: 'key',
  bucket: 'ai-drama-1255393412',
  region: 'ap-shanghai',
}

runTest('isAllowedAssetProxyTarget allows configured COS image URLs', () => {
  assert.equal(
    isAllowedAssetProxyTarget(
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg',
      config,
    ),
    true,
  )
})

runTest('isAllowedAssetProxyTarget allows configured COS video URLs', () => {
  assert.equal(
    isAllowedAssetProxyTarget(
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4',
      config,
    ),
    true,
  )
})

runTest('isAllowedAssetProxyTarget allows VolcEngine TOS temporary asset URLs', () => {
  assert.equal(
    isAllowedAssetProxyTarget(
      'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/a.jpeg?X-Tos-Expires=86400',
      config,
    ),
    true,
  )
})

runTest('isAllowedAssetProxyTarget rejects non-asset and unconfigured hosts', () => {
  assert.equal(isAllowedAssetProxyTarget('https://example.com/seedream/images/a.jpeg', config), false)
  assert.equal(isAllowedAssetProxyTarget('https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/login', config), false)
  assert.equal(isAllowedAssetProxyTarget('http://127.0.0.1/static/images/a.jpeg', config), false)
})

runTest('shouldRedirectAssetProxyTarget proxies configured COS streamable media so anti-hotlink rules do not block playback', () => {
  assert.equal(
    shouldRedirectAssetProxyTarget(
      new URL('https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4'),
      config,
    ),
    false,
  )
})

runTest('shouldRedirectAssetProxyTarget redirects non-COS streamable media instead of proxying response bodies', () => {
  assert.equal(
    shouldRedirectAssetProxyTarget(new URL('https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance/a.mp4')),
    true,
  )
  assert.equal(
    shouldRedirectAssetProxyTarget(new URL('https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/audio/a.mp3?sign=1')),
    true,
  )
  assert.equal(
    shouldRedirectAssetProxyTarget(new URL('https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg')),
    false,
  )
})

runTest('redirectAssetProxyTarget suppresses referer for COS anti-hotlink rules', () => {
  const target = new URL('https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/merged/a.mp4')
  const response = redirectAssetProxyTarget(target)

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), target.href)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})
