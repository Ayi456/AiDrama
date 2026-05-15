import assert from 'node:assert/strict'

import {
  buildDefaultVideoPrompt,
  buildVideoGeneratePayload,
} from '../chapterShotMediaPolicy.ts'

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
  dialogue: '旁白：山门外的钟声骤然响起。\n顾玄：别慌，先看阵眼。',
  duration: 7,
}

runTest('default video prompt includes dialogue and narration', () => {
  const prompt = buildDefaultVideoPrompt(storyboard)

  assert.match(prompt, /对白\/旁白：旁白：山门外的钟声骤然响起。/)
  assert.match(prompt, /顾玄：别慌，先看阵眼。/)
})

runTest('video generation payload appends dialogue when custom video prompt omits it', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
  })

  assert.match(payload.prompt, /shot 9 video/)
  assert.match(payload.prompt, /对白\/旁白：旁白：山门外的钟声骤然响起。/)
  assert.match(payload.prompt, /顾玄：别慌，先看阵眼。/)
})

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

runTest('multimodal mode can include a captured frame as a reference image', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['manual-image.png'],
      reference_video_urls: ['motion-ref.mp4'],
      reference_audio_urls: ['voice-ref.mp3'],
    },
  })

  assert.equal(payload.reference_mode, 'multimodal')
  assert.deepEqual(payload.reference_image_urls, ['captured-frame.png', 'manual-image.png'])
  assert.deepEqual(payload.reference_video_urls, ['motion-ref.mp4'])
  assert.deepEqual(payload.reference_audio_urls, ['voice-ref.mp3'])
  assert.equal(payload.first_frame_url, undefined)
  assert.equal(payload.image_url, undefined)
})
