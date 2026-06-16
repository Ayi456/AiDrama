import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  filterRowsOwnedByUser,
  isOwnedByUser,
  ownerIdFromCurrentUser,
} from '../policies/ownership-policy.js'

test('isOwnedByUser only accepts rows owned by the current account', () => {
  assert.equal(isOwnedByUser({ userId: 7 }, 7), true)
  assert.equal(isOwnedByUser({ userId: 8 }, 7), false)
  assert.equal(isOwnedByUser({ userId: null }, 7), false)
})

test('filterRowsOwnedByUser hides another account rows and legacy unowned rows', () => {
  const rows = [
    { id: 1, userId: 7 },
    { id: 2, userId: 8 },
    { id: 3, userId: null },
  ]
  assert.deepEqual(filterRowsOwnedByUser(rows, 7).map((row) => row.id), [1])
})

test('ownerIdFromCurrentUser returns the numeric authenticated user id', () => {
  assert.equal(ownerIdFromCurrentUser({ id: 12 }), 12)
})
