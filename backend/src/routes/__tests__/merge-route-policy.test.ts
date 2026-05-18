import assert from 'node:assert/strict'

import { selectedStoryboardIdsFromBody } from '../merge-route-policy.js'

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
