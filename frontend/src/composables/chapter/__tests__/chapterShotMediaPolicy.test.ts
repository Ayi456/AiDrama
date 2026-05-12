import assert from 'node:assert/strict'

import { buildVideoGeneratePayload } from '../chapterShotMediaPolicy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const storyboard = {
  id: 9,
  title: '镜头九',
  first_frame_image: 'current-first.png',
  last_frame_image: 'current-last.png',
  video_prompt: 'shot 9 video',
  duration: 7,
}

runTest('capture mode keeps captured first frame and current tail frame', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
    override: {
      reference_mode: 'capture',
      first_frame_url: 'captured-frame.png',
    },
  })

  assert.equal(payload.reference_mode, 'first_last')
  assert.equal(payload.first_frame_url, 'captured-frame.png')
  assert.equal(payload.last_frame_url, 'current-last.png')
  assert.equal(payload.image_url, undefined)
})

runTest('capture mode falls back to single image when no tail frame exists', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...storyboard,
      last_frame_image: '',
    },
    dramaId: 3,
    override: {
      reference_mode: 'capture',
      first_frame_url: 'captured-frame.png',
    },
  })

  assert.equal(payload.reference_mode, 'single')
  assert.equal(payload.image_url, 'captured-frame.png')
  assert.equal(payload.first_frame_url, undefined)
  assert.equal(payload.last_frame_url, undefined)
})
