import assert from 'node:assert/strict'

import { completeViduWebhookVideo } from '../webhooks/vidu-webhook-completion.js'

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

runTest('completeViduWebhookVideo reuses generated video completion and preserves webhook log shape', async () => {
  let tick = 0
  const videoPatches: unknown[] = []
  const storyboardPatches: unknown[] = []
  const logs: unknown[] = []

  const result = await completeViduWebhookVideo({
    taskId: 'vidu-task-1',
    record: {
      id: 31,
      storyboardId: 12,
    },
    videoUrl: 'https://provider.example.com/vidu.mp4',
  }, {
    now: () => `t${++tick}`,
    downloadFile: async (url: string, folder: string) => {
      assert.equal(`${url}:${folder}`, 'https://provider.example.com/vidu.mp4:videos')
      return 'static/videos/vidu.mp4'
    },
    uploadGeneratedAsset: async (localPath: string) => {
      assert.equal(localPath, 'static/videos/vidu.mp4')
      return 'https://cos.example.com/videos/vidu.mp4'
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
    action: 'publish',
    localPath: 'static/videos/vidu.mp4',
    publicUrl: 'https://cos.example.com/videos/vidu.mp4',
  })
  assert.deepEqual(videoPatches, [{
    videoUrl: 'https://cos.example.com/videos/vidu.mp4',
    localPath: 'static/videos/vidu.mp4',
    minioUrl: 'https://cos.example.com/videos/vidu.mp4',
    status: 'completed',
    completedAt: 't1',
    updatedAt: 't1',
  }])
  assert.deepEqual(storyboardPatches, [{
    storyboardId: 12,
    patch: {
      videoUrl: 'https://cos.example.com/videos/vidu.mp4',
      duration: undefined,
      updatedAt: 't2',
    },
  }])
  assert.deepEqual(logs, [{
    taskName: 'Webhook',
    event: 'vidu-video-updated',
    payload: {
      taskId: 'vidu-task-1',
      generationId: 31,
      storyboardId: 12,
      localPath: 'static/videos/vidu.mp4',
      publicUrl: 'https://cos.example.com/videos/vidu.mp4',
    },
  }])
})
