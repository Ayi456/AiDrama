import assert from 'node:assert/strict'

import {
  createMemoryAuthStorage,
  readStoredAuth,
  writeStoredAuth,
  clearStoredAuth,
  validateStoredAuthSession,
} from '../useAuth.ts'

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('auth storage persists user without exposing a token', () => {
  const storage = createMemoryAuthStorage()

  writeStoredAuth(storage, {
    user: {
      id: 1,
      username: 'StudioUser',
      email: 'user@example.com',
      phone: '13800138000',
      status: 'active',
    },
  })

  assert.deepEqual(readStoredAuth(storage), {
    user: {
      id: 1,
      username: 'StudioUser',
      email: 'user@example.com',
      phone: '13800138000',
      status: 'active',
    },
  })
})

await runTest('auth storage ignores corrupt persisted data', () => {
  const storage = createMemoryAuthStorage()
  storage.setItem('aidrama-auth', '{bad json')

  assert.equal(readStoredAuth(storage), null)
})

await runTest('clearStoredAuth removes persisted auth state', () => {
  const storage = createMemoryAuthStorage()
  writeStoredAuth(storage, {
    user: { id: 1, username: 'StudioUser', email: 'user@example.com', phone: '13800138000', status: 'active' },
  })

  clearStoredAuth(storage)

  assert.equal(readStoredAuth(storage), null)
})

await runTest('validateStoredAuthSession clears persisted auth when the session is rejected', async () => {
  const storage = createMemoryAuthStorage()
  writeStoredAuth(storage, {
    user: { id: 1, username: 'StudioUser', email: 'user@example.com', phone: '13800138000', status: 'active' },
  })

  const user = await validateStoredAuthSession({
    storage,
    loadSession: async () => {
      throw new Error('未登录')
    },
  })

  assert.equal(user, null)
  assert.equal(readStoredAuth(storage), null)
})

await runTest('validateStoredAuthSession refreshes user from cookie-backed session without storing a token', async () => {
  const storage = createMemoryAuthStorage()
  const user = await validateStoredAuthSession({
    storage,
    loadSession: async () => ({
      user: { id: 2, username: 'CookieUser', email: 'cookie@example.com', phone: '13900139000', status: 'active' },
    }),
  })

  assert.equal(user?.username, 'CookieUser')
  assert.deepEqual(readStoredAuth(storage), {
    user: { id: 2, username: 'CookieUser', email: 'cookie@example.com', phone: '13900139000', status: 'active' },
  })
})
