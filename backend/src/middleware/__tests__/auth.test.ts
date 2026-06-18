import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPublicApiPath } from '../auth-policy.js'

test('isPublicApiPath leaves auth, health, and asset proxy outside the auth guard', () => {
  assert.equal(isPublicApiPath('/api/v1/auth/login'), true)
  assert.equal(isPublicApiPath('/api/v1/health'), true)
  assert.equal(isPublicApiPath('/api/v1/assets/proxy'), true)
  assert.equal(isPublicApiPath('/api/v1/dramas'), false)
  assert.equal(isPublicApiPath('/api/v1/character-assets'), false)
})
