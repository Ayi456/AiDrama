import { createClient, type RedisClientType } from 'redis'

import { ensureProjectEnvLoaded } from '../../utils/project-env.js'
import type { SessionCacheClient } from './session-cache.js'

ensureProjectEnvLoaded()

let clientPromise: Promise<RedisClientType> | null = null
let warned = false

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]) {
  for (const key of keys) {
    const value = env[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function buildRedisUrlFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const directUrl = envValue(env, 'REDIS_URL')
  if (directUrl) return directUrl

  const host = envValue(env, 'REDIS_HOST')
  if (!host) return ''
  const port = Number(envValue(env, 'REDIS_PORT') || 6379)
  const password = envValue(env, 'REDIS_PASSWORD')
  const db = envValue(env, 'REDIS_DB')
  const auth = password ? `:${encodeURIComponent(password)}@` : ''
  const path = db ? `/${encodeURIComponent(db)}` : ''
  return `redis://${auth}${host}:${port}${path}`
}

async function getRedisClient() {
  if (!clientPromise) {
    const url = buildRedisUrlFromEnv()
    if (!url) return null

    clientPromise = (async () => {
      const client = createClient({ url })
      client.on('error', (error) => {
        if (!warned) {
          warned = true
          console.warn('[auth] Redis session cache error:', error instanceof Error ? error.message : String(error))
        }
      })
      await client.connect()
      return client as RedisClientType
    })()
  }

  try {
    return await clientPromise
  } catch (error) {
    clientPromise = null
    if (!warned) {
      warned = true
      console.warn('[auth] Redis session cache unavailable:', error instanceof Error ? error.message : String(error))
    }
    return null
  }
}

export async function getRedisSessionCache(): Promise<SessionCacheClient | null> {
  const client = await getRedisClient()
  return client
}
