import assert from 'node:assert/strict'

import { resolveSelectedStoryboardAfterRefresh } from '../chapterSelectionPolicy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('refresh keeps selected id but returns the fresh storyboard object', () => {
  const stale = { id: 2, video_url: '' }
  const fresh = { id: 2, video_url: 'new-video.mp4' }
  const selected = resolveSelectedStoryboardAfterRefresh([{ id: 1 }, fresh], stale)

  assert.equal(selected, fresh)
  assert.equal(selected?.video_url, 'new-video.mp4')
})

runTest('refresh falls back to first storyboard when selected id disappears', () => {
  const first = { id: 3 }
  assert.equal(resolveSelectedStoryboardAfterRefresh([first], { id: 2 }), first)
})

runTest('refresh clears selection when storyboard list is empty', () => {
  assert.equal(resolveSelectedStoryboardAfterRefresh([], { id: 2 }), null)
})
