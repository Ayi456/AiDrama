import assert from 'node:assert/strict'

import {
  buildImageCompletionPatch,
  buildVideoCompletionPatch,
  publishGeneratedAsset,
} from '../media-completion.js'

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL ${name}`)
      throw error
    })
}

runTest('publishGeneratedAsset prefers a public upload URL and falls back to local path', async () => {
  const uploaded = await publishGeneratedAsset('static/images/a.png', async (localPath: string) => {
    assert.equal(localPath, 'static/images/a.png')
    return 'https://cos.example.com/images/a.png'
  })
  const fallback = await publishGeneratedAsset('static/images/b.png', async () => null)

  assert.equal(uploaded, 'https://cos.example.com/images/a.png')
  assert.equal(fallback, 'static/images/b.png')
})

runTest('buildImageCompletionPatch marks generated images as completed assets', () => {
  assert.deepEqual(
    buildImageCompletionPatch({
      publicUrl: 'https://cos.example.com/images/a.png',
      localPath: 'static/images/a.png',
      updatedAt: 't1',
    }),
    {
      imageUrl: 'https://cos.example.com/images/a.png',
      localPath: 'static/images/a.png',
      minioUrl: 'https://cos.example.com/images/a.png',
      status: 'completed',
      updatedAt: 't1',
    },
  )
})

runTest('buildVideoCompletionPatch records completion time for generated videos', () => {
  assert.deepEqual(
    buildVideoCompletionPatch({
      publicUrl: 'https://cos.example.com/videos/a.mp4',
      localPath: 'static/videos/a.mp4',
      completedAt: 't2',
    }),
    {
      videoUrl: 'https://cos.example.com/videos/a.mp4',
      localPath: 'static/videos/a.mp4',
      minioUrl: 'https://cos.example.com/videos/a.mp4',
      status: 'completed',
      completedAt: 't2',
      updatedAt: 't2',
    },
  )
})
