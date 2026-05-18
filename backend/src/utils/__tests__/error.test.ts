import assert from 'node:assert/strict'

import { errorMessageFromUnknown } from '../error.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('errorMessageFromUnknown prefers error messages and falls back safely', () => {
  assert.equal(errorMessageFromUnknown(new Error('boom')), 'boom')
  assert.equal(errorMessageFromUnknown(new Error('')), 'Request failed')
  assert.equal(errorMessageFromUnknown('broken'), 'broken')
  assert.equal(errorMessageFromUnknown(''), 'Request failed')
  assert.equal(errorMessageFromUnknown({}), 'Request failed')
})
