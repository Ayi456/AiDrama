import assert from 'node:assert/strict'

import {
  buildImageCompletionPatch,
  buildVideoCompletionPatch,
  completeGeneratedImageJob,
  completeGeneratedVideoJob,
  materializeGeneratedImage,
  materializeGeneratedVideo,
  publishGeneratedAsset,
} from '../media/assets/media-completion.js'

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

runTest('materializeGeneratedImage downloads URL sources into image storage', async () => {
  const calls: string[] = []
  const result = await materializeGeneratedImage({
    type: 'url',
    imageUrl: 'https://provider.example.com/image.png',
  }, {
    downloadFile: async (url: string, folder: string) => {
      calls.push(`${url}:${folder}`)
      return 'static/images/downloaded.png'
    },
    saveBase64Image: async () => {
      assert.fail('URL image sources should not use base64 storage')
    },
  })

  assert.deepEqual(calls, ['https://provider.example.com/image.png:images'])
  assert.deepEqual(result, {
    kind: 'downloaded',
    localPath: 'static/images/downloaded.png',
  })
})

runTest('materializeGeneratedImage saves base64 sources into image storage', async () => {
  const calls: string[] = []
  const result = await materializeGeneratedImage({
    type: 'base64',
    data: 'raw-image',
    mimeType: 'image/png',
  }, {
    downloadFile: async () => {
      assert.fail('Base64 image sources should not use URL downloads')
    },
    saveBase64Image: async (data: string, mimeType: string, folder: string) => {
      calls.push(`${data}:${mimeType}:${folder}`)
      return 'static/images/base64.png'
    },
  })

  assert.deepEqual(calls, ['raw-image:image/png:images'])
  assert.deepEqual(result, {
    kind: 'saved-base64',
    localPath: 'static/images/base64.png',
    mimeType: 'image/png',
  })
})

runTest('materializeGeneratedVideo downloads URL sources into video storage', async () => {
  const calls: string[] = []
  const result = await materializeGeneratedVideo({
    type: 'url',
    videoUrl: 'https://provider.example.com/video.mp4',
  }, {
    downloadFile: async (url: string, folder: string) => {
      calls.push(`${url}:${folder}`)
      return 'static/videos/downloaded.mp4'
    },
  })

  assert.deepEqual(calls, ['https://provider.example.com/video.mp4:videos'])
  assert.deepEqual(result, {
    kind: 'downloaded',
    localPath: 'static/videos/downloaded.mp4',
  })
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

runTest('completeGeneratedImageJob persists generated image and publishes owner records', async () => {
  let tick = 0
  const imagePatches: unknown[] = []
  const storyboardPatches: unknown[] = []
  const characterPatches: unknown[] = []
  const scenePatches: unknown[] = []
  const logs: unknown[] = []

  const result = await completeGeneratedImageJob({
    id: 17,
    provider: 'gemini',
    source: { type: 'base64', data: 'raw-image', mimeType: 'image/png' },
  }, {
    now: () => `t${++tick}`,
    downloadFile: async () => {
      assert.fail('Base64 image completions should not download URL sources')
    },
    saveBase64Image: async (data: string, mimeType: string, folder: string) => {
      assert.equal(`${data}:${mimeType}:${folder}`, 'raw-image:image/png:images')
      return 'static/images/generated.png'
    },
    uploadGeneratedAsset: async (localPath: string) => {
      assert.equal(localPath, 'static/images/generated.png')
      return 'https://cos.example.com/images/generated.png'
    },
    loadOwnerRecord: async (id: number) => {
      assert.equal(id, 17)
      return {
        storyboardId: 3,
        characterId: 4,
        sceneId: 5,
        frameType: 'first_frame',
      }
    },
    persistImageCompletion: async (patch) => {
      imagePatches.push(patch)
    },
    publishStoryboardImage: async (storyboardId, patch) => {
      storyboardPatches.push({ storyboardId, patch })
    },
    publishCharacterImage: async (characterId, patch) => {
      characterPatches.push({ characterId, patch })
    },
    publishSceneImage: async (sceneId, patch) => {
      scenePatches.push({ sceneId, patch })
    },
    logSuccess: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
  })

  assert.deepEqual(result, {
    localPath: 'static/images/generated.png',
    publicUrl: 'https://cos.example.com/images/generated.png',
  })
  assert.deepEqual(imagePatches, [{
    imageUrl: 'https://cos.example.com/images/generated.png',
    localPath: 'static/images/generated.png',
    minioUrl: 'https://cos.example.com/images/generated.png',
    status: 'completed',
    updatedAt: 't1',
  }])
  assert.deepEqual(logs, [{
    taskName: 'ImageTask',
    event: 'saved-base64',
    payload: {
      id: 17,
      provider: 'gemini',
      mimeType: 'image/png',
      localPath: 'static/images/generated.png',
      publicUrl: 'https://cos.example.com/images/generated.png',
    },
  }])
  assert.deepEqual(storyboardPatches, [{
    storyboardId: 3,
    patch: {
      firstFrameImage: 'https://cos.example.com/images/generated.png',
      updatedAt: 't2',
    },
  }])
  assert.deepEqual(characterPatches, [{
    characterId: 4,
    patch: {
      imageUrl: 'https://cos.example.com/images/generated.png',
      localPath: 'static/images/generated.png',
      updatedAt: 't3',
    },
  }])
  assert.deepEqual(scenePatches, [{
    sceneId: 5,
    patch: {
      imageUrl: 'https://cos.example.com/images/generated.png',
      localPath: 'static/images/generated.png',
      status: 'completed',
      updatedAt: 't4',
    },
  }])
})

runTest('completeGeneratedVideoJob persists generated video and publishes storyboard video', async () => {
  let tick = 0
  const videoPatches: unknown[] = []
  const storyboardPatches: unknown[] = []
  const logs: unknown[] = []

  const result = await completeGeneratedVideoJob({
    id: 23,
    source: { type: 'url', videoUrl: 'https://provider.example.com/video.mp4' },
    duration: 12,
    storyboardId: 8,
  }, {
    now: () => `v${++tick}`,
    downloadFile: async (url: string, folder: string) => {
      assert.equal(`${url}:${folder}`, 'https://provider.example.com/video.mp4:videos')
      return 'static/videos/generated.mp4'
    },
    uploadGeneratedAsset: async (localPath: string) => {
      assert.equal(localPath, 'static/videos/generated.mp4')
      return 'https://cos.example.com/videos/generated.mp4'
    },
    persistVideoCompletion: async (patch) => {
      videoPatches.push(patch)
    },
    publishStoryboardVideo: async (storyboardId, patch) => {
      storyboardPatches.push({ storyboardId, patch })
    },
    logSuccess: (taskName, event, payload) => {
      logs.push({ taskName, event, payload })
    },
  })

  assert.deepEqual(result, {
    localPath: 'static/videos/generated.mp4',
    publicUrl: 'https://cos.example.com/videos/generated.mp4',
  })
  assert.deepEqual(videoPatches, [{
    videoUrl: 'https://cos.example.com/videos/generated.mp4',
    localPath: 'static/videos/generated.mp4',
    minioUrl: 'https://cos.example.com/videos/generated.mp4',
    status: 'completed',
    completedAt: 'v1',
    updatedAt: 'v1',
  }])
  assert.deepEqual(logs, [{
    taskName: 'VideoTask',
    event: 'downloaded',
    payload: {
      id: 23,
      localPath: 'static/videos/generated.mp4',
      publicUrl: 'https://cos.example.com/videos/generated.mp4',
      storyboardId: 8,
      duration: 12,
    },
  }])
  assert.deepEqual(storyboardPatches, [{
    storyboardId: 8,
    patch: {
      videoUrl: 'https://cos.example.com/videos/generated.mp4',
      duration: 12,
      updatedAt: 'v2',
    },
  }])
})
