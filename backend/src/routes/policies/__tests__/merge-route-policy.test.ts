import assert from 'node:assert/strict'

import {
  selectedMergeClipOverridesFromBody,
  selectedStoryboardIdsFromBody,
} from '../merge-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('selectedStoryboardIdsFromBody normalizes snake_case ids and drops invalid values', () => {
  assert.deepEqual(selectedStoryboardIdsFromBody({
    storyboard_ids: [3, '4', 0, -2, 'nope', 3],
  }), [3, 4])
})

runTest('selectedStoryboardIdsFromBody accepts camelCase aliases', () => {
  assert.deepEqual(selectedStoryboardIdsFromBody({
    storyboardIds: [11, '12', 11],
  }), [11, 12])
})

runTest('selectedStoryboardIdsFromBody does not infer ids from selected clip payloads', () => {
  assert.equal(selectedStoryboardIdsFromBody({
    clips: [
      { storyboard_id: 3, video_url: 'static/videos/latest-3.mp4' },
      { storyboardId: 4, videoUrl: 'static/videos/latest-4.mp4' },
      { storyboard_id: 'bad', video_url: 'static/videos/skip.mp4' },
      null,
    ],
  }), undefined)
})

runTest('selectedMergeClipOverridesFromBody normalizes clip urls and deduplicates by storyboard', () => {
  assert.deepEqual(selectedMergeClipOverridesFromBody({
    clips: [
      { storyboard_id: 3, video_url: ' static/videos/older-3.mp4 ' },
      { storyboardId: 3, videoUrl: 'static/videos/latest-3.mp4' },
      { storyboardId: 4, videoUrl: 'static/videos/latest-4.mp4' },
      { storyboardId: 5, videoUrl: '' },
    ],
  }), [
    { storyboardId: 3, videoUrl: 'static/videos/latest-3.mp4' },
    { storyboardId: 4, videoUrl: 'static/videos/latest-4.mp4' },
  ])
})

runTest('selectedMergeClipOverridesFromBody only accepts the canonical clips field', () => {
  assert.deepEqual(selectedMergeClipOverridesFromBody({
    mergeClips: [
      { storyboardId: 3, videoUrl: 'static/videos/ignored.mp4' },
    ],
    merge_clips: [
      { storyboard_id: 4, video_url: 'static/videos/ignored-too.mp4' },
    ],
  }), [])
})
