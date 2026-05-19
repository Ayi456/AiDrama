import assert from 'node:assert/strict'

import { normalizeGridAssignments } from '../grid-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('normalizeGridAssignments accepts snake_case and camelCase assignment bodies', () => {
  assert.deepEqual(
    normalizeGridAssignments([
      { storyboard_id: '7', frame_type: 'reference' },
      { storyboardId: 8, frameType: 'first_frame' },
      { storyboard_id: 0, frame_type: 'last_frame' },
      { storyboard_id: 'nope', frame_type: 123 },
    ]),
    [
      { storyboardId: 7, frameType: 'reference' },
      { storyboardId: 8, frameType: 'first_frame' },
    ],
  )
})
