import assert from 'node:assert/strict'

import {
  getCaptureSourceVideoUrl,
  getCaptureTailFrameOptions,
  getDefaultCaptureTailFrameUrl,
} from '../chapterVideoCaptureTargets.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const storyboards = [
  {
    id: 1,
    title: '前一镜头',
    video_url: 'prev-video.mp4',
    composed_video_url: 'prev-composed.mp4',
    composed_image: 'prev-cover.png',
    first_frame_image: 'prev-first.png',
    last_frame_image: 'prev-last.png',
  },
  {
    id: 2,
    title: '当前镜头',
    composed_image: 'current-cover.png',
    first_frame_image: 'current-first.png',
    last_frame_image: 'current-last.png',
  },
]

runTest('capture source video comes from the previous storyboard', () => {
  assert.equal(getCaptureSourceVideoUrl(storyboards[1], storyboards), 'prev-video.mp4')
})

runTest('capture source video falls back to composed video when needed', () => {
  assert.equal(
    getCaptureSourceVideoUrl(
      storyboards[1],
      [
        {
          ...storyboards[0],
          video_url: '',
        },
        storyboards[1]!,
      ],
    ),
    'prev-composed.mp4',
  )
})

runTest('capture tail frame options prefer the current cover and keep distinct frame images', () => {
  const options = getCaptureTailFrameOptions(storyboards[1])

  assert.deepEqual(
    options.map(item => item.url),
    ['current-cover.png', 'current-first.png', 'current-last.png'],
  )
  assert.equal(getDefaultCaptureTailFrameUrl(storyboards[1]), 'current-cover.png')
})
