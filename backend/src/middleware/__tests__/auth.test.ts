import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPublicApiPath, readBearerToken } from '../auth-policy.js'

test('readBearerToken accepts bearer authorization headers only', () => {
  assert.equal(readBearerToken('Bearer abc123'), 'abc123')
  assert.equal(readBearerToken('bearer spaced-token  '), 'spaced-token')
  assert.equal(readBearerToken('Token abc123'), '')
  assert.equal(readBearerToken(undefined), '')
})

test('isPublicApiPath leaves auth, health, and asset proxy outside the auth guard', () => {
  assert.equal(isPublicApiPath('/api/v1/auth/login'), true)
  assert.equal(isPublicApiPath('/api/v1/health'), true)
  assert.equal(isPublicApiPath('/api/v1/assets/proxy'), true)
  assert.equal(isPublicApiPath('/api/v1/dramas'), false)
  assert.equal(isPublicApiPath('/api/v1/character-assets'), false)
})
