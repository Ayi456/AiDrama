import { SESSION_TTL_SECONDS } from './session-policy.js'

export const SESSION_CACHE_TTL_SECONDS = SESSION_TTL_SECONDS

export type SessionUser = {
  id: number
  username: string
  email: string
  phone: string
  status: string
  createdAt?: string
  lastLoginAt?: string | null
}

export type SessionCacheClient = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options: { EX: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}

export function sessionCacheKey(token: string) {
  return `aidrama:session:${token}`
}

function isSessionUser(value: unknown): value is SessionUser {
  const user = value as Partial<SessionUser> | null
  return !!user
    && typeof user.id === 'number'
    && typeof user.username === 'string'
    && typeof user.email === 'string'
    && typeof user.phone === 'string'
    && typeof user.status === 'string'
}

export function parseCachedSessionUser(value: string | null): SessionUser | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return isSessionUser(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function writeSessionUserCache(cache: SessionCacheClient | null, token: string, user: SessionUser) {
  if (!cache || !token) return
  await cache.set(sessionCacheKey(token), JSON.stringify(user), { EX: SESSION_CACHE_TTL_SECONDS })
}

export async function deleteSessionUserCache(cache: SessionCacheClient | null, token: string) {
  if (!cache || !token) return
  await cache.del(sessionCacheKey(token))
}

export async function resolveSessionUserWithCache(
  token: string,
  deps: {
    cache?: SessionCacheClient | null
    loadSessionUser: (token: string) => Promise<SessionUser | null>
  },
): Promise<SessionUser | null> {
  if (!token) return null
  const cache = deps.cache ?? null
  const cached = cache ? parseCachedSessionUser(await cache.get(sessionCacheKey(token))) : null
  if (cached) return cached

  const loaded = await deps.loadSessionUser(token)
  if (loaded) await writeSessionUserCache(cache, token, loaded)
  return loaded
}
