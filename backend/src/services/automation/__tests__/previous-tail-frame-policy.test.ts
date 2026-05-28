import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePreviousTailFrameState } from '../previous-tail-frame-policy.js'

test('resolvePreviousTailFrameState reuses an existing video tail frame first', () => {
  assert.deepEqual(resolvePreviousTailFrameState({
    storyboardLastFrameImage: '/static/tail-frames/storyboard.png',
    videoGeneration: {
      id: 451,
      tailFrameUrl: '/static/tail-frames/video.png',
      localPath: 'static/videos/source.mp4',
    },
  }), {
    url: '/static/tail-frames/video.png',
    captureVideoGenerationId: null,
    captureLocalPath: null,
  })
})

test('resolvePreviousTailFrameState falls back to storyboard last frame image', () => {
  assert.deepEqual(resolvePreviousTailFrameState({
    storyboardLastFrameImage: '/static/tail-frames/storyboard.png',
    videoGeneration: null,
  }), {
    url: '/static/tail-frames/storyboard.png',
    captureVideoGenerationId: null,
    captureLocalPath: null,
  })
})

test('resolvePreviousTailFrameState requests capture when completed video has no tail frame yet', () => {
  assert.deepEqual(resolvePreviousTailFrameState({
    storyboardLastFrameImage: null,
    videoGeneration: {
      id: 451,
      tailFrameUrl: null,
      localPath: 'static/videos/source.mp4',
    },
  }), {
    url: null,
    captureVideoGenerationId: 451,
    captureLocalPath: 'static/videos/source.mp4',
  })
})
