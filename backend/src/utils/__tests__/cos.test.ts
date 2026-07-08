import assert from 'node:assert/strict'
import path from 'node:path'

import {
  buildCosObjectUrl,
  createCosPresignedObjectUrl,
  createCosRequestAuthorization,
  cosUrlToStaticPath,
  staticAssetToCosObjectKey,
  staticAssetToLocalPath,
} from '../cos.js'

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

runTest('staticAssetToCosObjectKey maps images to seedream and videos to seedance', () => {
  assert.equal(
    staticAssetToCosObjectKey('static/images/demo file.jpeg'),
    'seedream/images/demo file.jpeg',
  )
  assert.equal(
    staticAssetToCosObjectKey('static/grid-cells/cell_1.png'),
    'seedream/grid-cells/cell_1.png',
  )
  assert.equal(
    staticAssetToCosObjectKey('static/videos/demo.mp4'),
    'seedance/videos/demo.mp4',
  )
  assert.equal(
    staticAssetToCosObjectKey('static/composed/demo.mp4'),
    'seedance/composed/demo.mp4',
  )
  assert.equal(
    staticAssetToCosObjectKey('static/merged/demo.mp4'),
    'seedance/merged/demo.mp4',
  )
})

runTest('buildCosObjectUrl preserves object folders and encodes unsafe characters', () => {
  assert.equal(
    buildCosObjectUrl('seedream/images/demo file.jpeg', config),
    'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/demo%20file.jpeg',
  )
})

runTest('cosUrlToStaticPath converts configured seedream COS URL back to stored static path', () => {
  assert.equal(
    cosUrlToStaticPath(
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/demo%20file.jpeg',
      config,
    ),
    'static/images/demo file.jpeg',
  )
})

runTest('cosUrlToStaticPath converts configured seedance COS URL back to stored static path', () => {
  assert.equal(
    cosUrlToStaticPath(
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/demo.mp4',
      config,
    ),
    'static/videos/demo.mp4',
  )
})

runTest('cosUrlToStaticPath leaves non-matching URLs unchanged', () => {
  const url = 'https://example.com/static/images/demo.jpeg'
  assert.equal(cosUrlToStaticPath(url, config), url)
})

runTest('staticAssetToLocalPath maps static paths and configured COS URLs to data root', () => {
  assert.equal(
    staticAssetToLocalPath('static/videos/demo.mp4', '/repo/data', '/repo/data/static', config),
    path.join('/repo/data', 'static/videos/demo.mp4'),
  )
  assert.equal(
    staticAssetToLocalPath(
      'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/demo.mp4',
      '/repo/data',
      '/repo/data/static',
      config,
    ),
    path.join('/repo/data', 'static/videos/demo.mp4'),
  )
})

runTest('createCosRequestAuthorization signs configured COS URLs only', () => {
  const authorization = createCosRequestAuthorization(
    'GET',
    'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/demo.mp4',
    config,
  )

  assert.ok(authorization)
  assert.match(authorization, /q-ak=id/)
  assert.match(authorization, /q-header-list=host/)
  assert.equal(
    createCosRequestAuthorization('GET', 'https://example.com/seedance/videos/demo.mp4', config),
    null,
  )
})

runTest('createCosRequestAuthorization signs for 24h so long-lived media sessions keep working', () => {
  const authorization = createCosRequestAuthorization(
    'GET',
    'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/demo.mp4',
    config,
  )

  assert.ok(authorization)
  const signTime = authorization.match(/q-sign-time=(\d+);(\d+)/)
  assert.ok(signTime, 'expected q-sign-time in authorization')
  assert.equal(Number(signTime[2]) - Number(signTime[1]), 86400)
})

runTest('createCosPresignedObjectUrl builds a signed PUT URL for direct uploads', () => {
  const signedUrl = createCosPresignedObjectUrl('PUT', 'seedream/uploads/demo.jpg', config)

  assert.ok(signedUrl)
  assert.match(signedUrl, /^https:\/\/ai-drama-1255393412\.cos\.ap-shanghai\.myqcloud\.com\/seedream\/uploads\/demo\.jpg\?/)
  assert.match(signedUrl, /q-ak=id/)
  assert.match(signedUrl, /q-signature=/)
})

runTest('createCosPresignedObjectUrl uses the native COS host when publicBaseUrl is configured', () => {
  const signedUrl = createCosPresignedObjectUrl('PUT', 'seedream/uploads/demo.jpg', {
    ...config,
    publicBaseUrl: 'https://assets.example.com',
  })

  assert.ok(signedUrl)
  assert.match(signedUrl, /^https:\/\/ai-drama-1255393412\.cos\.ap-shanghai\.myqcloud\.com\/seedream\/uploads\/demo\.jpg\?/)
})
