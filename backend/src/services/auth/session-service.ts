import type { RowDataPacket } from 'mysql2'

import { mysqlPool } from '../../db/index.js'
import { now } from '../../utils/response.js'
import type { SessionUser } from './session-cache.js'
import {
  deleteSessionUserCache,
  resolveSessionUserWithCache,
  writeSessionUserCache,
} from './session-cache.js'
import { getRedisSessionCache } from './redis-session-cache.js'

type SessionUserRow = RowDataPacket & {
  id: number
  username: string
  email: string
  phone: string
  status: string
  created_at: string
  last_login_at: string | null
}

function mapSessionUser(row: SessionUserRow): SessionUser {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export async function loadSessionUserFromDb(token: string): Promise<SessionUser | null> {
  if (!token) return null
  const [rows] = await mysqlPool.execute<SessionUserRow[]>(
    `SELECT u.id, u.username, u.email, u.phone, u.status, u.created_at, u.last_login_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > ?
        AND u.status = "active"
      LIMIT 1`,
    [token, now()],
  )
  return rows[0] ? mapSessionUser(rows[0]) : null
}

export async function findSessionUser(token: string): Promise<SessionUser | null> {
  const cache = await getRedisSessionCache()
  return resolveSessionUserWithCache(token, {
    cache,
    loadSessionUser: loadSessionUserFromDb,
  })
}

export async function cacheSessionUser(token: string, user: SessionUser) {
  const cache = await getRedisSessionCache()
  await writeSessionUserCache(cache, token, user)
}

export async function deleteSessionToken(token: string) {
  if (!token) return
  const cache = await getRedisSessionCache()
  await Promise.allSettled([
    mysqlPool.execute('DELETE FROM auth_sessions WHERE token = ?', [token]),
    deleteSessionUserCache(cache, token),
  ])
}
