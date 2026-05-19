import assert from 'node:assert/strict'

import { chapterRoutePath } from '../chapter-route-path.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('chapter route uses /chapters as the canonical path', () => {
  assert.equal(chapterRoutePath, '/chapters')
})
