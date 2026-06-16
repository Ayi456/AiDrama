import test from 'node:test'
import assert from 'node:assert/strict'

import { hashPassword, verifyPassword } from '../auth/password.js'

test('hashPassword creates salted hashes that verify the original password', async () => {
  const first = await hashPassword('secret123')
  const second = await hashPassword('secret123')

  assert.notEqual(first, second)
  assert.equal(first.includes('secret123'), false)
  assert.equal(await verifyPassword('secret123', first), true)
  assert.equal(await verifyPassword('wrong-password', first), false)
})
