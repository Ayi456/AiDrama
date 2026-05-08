import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { AliImageAdapter } from '../adapters/ali-image.js'
import { AliVideoAdapter } from '../adapters/ali-video.js'
import { ViduVideoAdapter } from '../adapters/vidu-video.js'
import type { AIConfig, VideoGenerationRecord } from '../adapters/types.js'

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

runTest('cleaned provider adapter files use ASCII source text', () => {
  const files = [
    'src/services/adapters/types.ts',
    'src/services/adapters/vidu-video.ts',
    'src/services/adapters/ali-image.ts',
    'src/services/adapters/ali-video.ts',
  ]

  for (const file of files) {
    const source = fs.readFileSync(path.resolve(file), 'utf8')
    assert.equal(/[^\x00-\x7F]/.test(source), false, `${file} still contains non-ASCII source text`)
  }
})

runTest('Vidu callback state parser maps callback states into video outcomes', () => {
  assert.deepEqual(
    ViduVideoAdapter.parseCallbackState({ state: 'success', video_url: 'https://cdn.example.com/video.mp4' }),
    { status: 'completed', videoUrl: 'https://cdn.example.com/video.mp4' },
  )
  assert.deepEqual(
    ViduVideoAdapter.parseCallbackState({ state: 'failed', error: 'quota exceeded' }),
    { status: 'failed', error: 'quota exceeded' },
  )
  assert.deepEqual(
    ViduVideoAdapter.parseCallbackState({ state: 'queued' }),
    { status: 'failed', error: 'Unknown state: queued' },
  )
})

runTest('Ali image adapter parses async, completed, failed, and processing responses', () => {
  const adapter = new AliImageAdapter()

  assert.deepEqual(
    adapter.parseGenerateResponse({ output: { task_status: 'PENDING', task_id: 'task-image' } }),
    { isAsync: true, taskId: 'task-image' },
  )
  assert.deepEqual(
    adapter.parsePollResponse({ output: { task_status: 'SUCCEEDED', choices: [{ message: { content: [{ image: 'https://img.example.com/a.png' }] } }] } }),
    { status: 'completed', imageUrl: 'https://img.example.com/a.png' },
  )
  assert.deepEqual(
    adapter.parsePollResponse({ output: { task_status: 'FAILED' }, message: 'bad prompt' }),
    { status: 'failed', error: 'bad prompt' },
  )
  assert.deepEqual(
    adapter.parsePollResponse({ output: { task_status: 'RUNNING' } }),
    { status: 'processing' },
  )
})

runTest('Ali video adapter keeps first-last frame payloads and parses task lifecycle responses', () => {
  const adapter = new AliVideoAdapter()
  const config: AIConfig = {
    provider: 'ali',
    baseUrl: 'https://dashscope.aliyuncs.com',
    apiKey: 'test-key',
    model: 'wan2.6-i2v-flash',
  }
  const record: VideoGenerationRecord = {
    id: 10,
    prompt: 'hero walks forward',
    firstFrameUrl: 'https://img.example.com/first.png',
    lastFrameUrl: 'https://img.example.com/last.png',
    aspectRatio: '9:16',
    duration: 6,
  }

  const request = adapter.buildGenerateRequest(config, record)
  assert.equal((request.body as { input: { img_url: string; last_img_url?: string } }).input.img_url, 'https://img.example.com/first.png')
  assert.equal((request.body as { input: { img_url: string; last_img_url?: string } }).input.last_img_url, 'https://img.example.com/last.png')

  assert.deepEqual(
    adapter.parseGenerateResponse({ output: { task_status: 'PENDING', task_id: 'task-video' } }),
    { isAsync: true, taskId: 'task-video' },
  )
  assert.deepEqual(
    adapter.parsePollResponse({ output: { task_status: 'SUCCEEDED', video_url: 'https://video.example.com/a.mp4' } }),
    { status: 'completed', videoUrl: 'https://video.example.com/a.mp4' },
  )
  assert.deepEqual(
    adapter.parsePollResponse({ output: { task_status: 'FAILED' }, message: 'provider failed' }),
    { status: 'failed', error: 'provider failed' },
  )
})
