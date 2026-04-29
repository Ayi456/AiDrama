import assert from 'node:assert/strict'

import {
  presentImageGenerationAsset,
  presentVideoGenerationAsset,
} from '../public-asset.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('presentImageGenerationAsset exposes COS URL as the primary image URL', () => {
  const row = presentImageGenerationAsset({
    id: 1,
    imageUrl: 'https://provider.example.com/temp.jpeg',
    minioUrl: 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg',
    localPath: 'static/images/a.jpeg',
  })

  assert.equal(row.imageUrl, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg')
  assert.equal(row.image_url, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg')
  assert.equal(row.localPath, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedream/images/a.jpeg')
  assert.equal(row.providerImageUrl, 'https://provider.example.com/temp.jpeg')
})

runTest('presentVideoGenerationAsset exposes COS URL as the primary video URL', () => {
  const row = presentVideoGenerationAsset({
    id: 1,
    videoUrl: 'https://provider.example.com/temp.mp4',
    minioUrl: 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4',
    localPath: 'static/videos/a.mp4',
  })

  assert.equal(row.videoUrl, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4')
  assert.equal(row.video_url, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4')
  assert.equal(row.localPath, 'https://ai-drama-1255393412.cos.ap-shanghai.myqcloud.com/seedance/videos/a.mp4')
  assert.equal(row.providerVideoUrl, 'https://provider.example.com/temp.mp4')
})
