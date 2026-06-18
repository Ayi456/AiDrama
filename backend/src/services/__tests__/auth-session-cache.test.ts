import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SESSION_CACHE_TTL_SECONDS,
  resolveSessionUserWithCache,
  sessionCacheKey,
} from '../auth/session-cache.js'
import { buildRedisUrlFromEnv } from '../auth/redis-session-cache.js'

const user = {
  id: 7,
  username: 'StudioUser',
  email: 'user@example.com',
  phone: '13800138000',
  status: 'active',
  createdAt: '2026-06-18T00:00:00.000Z',
  lastLoginAt: null,
}

test('resolveSessionUserWithCache returns cached user without loading from database', async () => {
  let loaded = false
  const resolved = await resolveSessionUserWithCache('tok', {
    cache: {
      get: async (key: string) => {
        assert.equal(key, sessionCacheKey('tok'))
        return JSON.stringify(user)
      },
      set: async () => assert.fail('cached session should not be written again'),
      del: async () => assert.fail('cached session should not be deleted'),
    },
    loadSessionUser: async () => {
      loaded = true
      return null
    },
  })

  assert.deepEqual(resolved, user)
  assert.equal(loaded, false)
})

test('resolveSessionUserWithCache loads database on miss and writes Redis cache', async () => {
  const writes: unknown[] = []
  const resolved = await resolveSessionUserWithCache('tok', {
    cache: {
      get: async () => null,
      set: async (...args: [string, string, { EX: number }]) => {
        writes.push(args)
      },
      del: async () => assert.fail('cache miss with live session should not delete'),
    },
    loadSessionUser: async () => user,
  })

  assert.deepEqual(resolved, user)
  assert.deepEqual(writes, [[
    sessionCacheKey('tok'),
    JSON.stringify(user),
    { EX: SESSION_CACHE_TTL_SECONDS },
  ]])
})

test('buildRedisUrlFromEnv prefers REDIS_URL when provided', () => {
  assert.equal(
    buildRedisUrlFromEnv({
      REDIS_URL: 'redis://direct.example.com:6380/2',
      REDIS_HOST: 'ignored.example.com',
    }),
    'redis://direct.example.com:6380/2',
  )
})

test('buildRedisUrlFromEnv builds a Redis URL from host settings', () => {
  assert.equal(
    buildRedisUrlFromEnv({
      REDIS_HOST: 'redis.example.com',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'p@ss word',
      REDIS_DB: '3',
    }),
    'redis://:p%40ss%20word@redis.example.com:6380/3',
  )
})
