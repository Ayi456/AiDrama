import assert from 'node:assert/strict'

import {
  createMemoryAuthStorage,
  readStoredAuth,
  writeStoredAuth,
  clearStoredAuth,
} from '../useAuth.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('auth storage persists token and user together', () => {
  const storage = createMemoryAuthStorage()

  writeStoredAuth(storage, {
    token: 'session-token',
    user: {
      id: 1,
      username: 'StudioUser',
      email: 'user@example.com',
      phone: '13800138000',
      status: 'active',
    },
  })

  assert.deepEqual(readStoredAuth(storage), {
    token: 'session-token',
    user: {
      id: 1,
      username: 'StudioUser',
      email: 'user@example.com',
      phone: '13800138000',
      status: 'active',
    },
  })
})

runTest('auth storage ignores corrupt persisted data', () => {
  const storage = createMemoryAuthStorage()
  storage.setItem('aidrama-auth', '{bad json')

  assert.equal(readStoredAuth(storage), null)
})

runTest('clearStoredAuth removes persisted auth state', () => {
  const storage = createMemoryAuthStorage()
  writeStoredAuth(storage, {
    token: 'session-token',
    user: { id: 1, username: 'StudioUser', email: 'user@example.com', phone: '13800138000', status: 'active' },
  })

  clearStoredAuth(storage)

  assert.equal(readStoredAuth(storage), null)
})
