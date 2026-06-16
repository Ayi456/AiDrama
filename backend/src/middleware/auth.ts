import type { Context, Next } from 'hono'
import type { RowDataPacket } from 'mysql2'

import { mysqlPool } from '../db/index.js'
import { now } from '../utils/response.js'
import { isPublicApiPath, readBearerToken } from './auth-policy.js'

export { isPublicApiPath, readBearerToken } from './auth-policy.js'

export type CurrentUser = {
  id: number
  username: string
  email: string
  phone: string
  status: string
}

type AuthContext = Context<{ Variables: { currentUser: CurrentUser } }>

type SessionUserRow = RowDataPacket & {
  id: number
  username: string
  email: string
  phone: string
  status: string
}

export async function findSessionUser(token: string): Promise<CurrentUser | null> {
  if (!token) return null
  const [rows] = await mysqlPool.execute<SessionUserRow[]>(
    `SELECT u.id, u.username, u.email, u.phone, u.status
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > ?
        AND u.status = "active"
      LIMIT 1`,
    [token, now()],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    phone: row.phone,
    status: row.status,
  }
}

export function getCurrentUser(c: Context): CurrentUser {
  const user = (c as AuthContext).get('currentUser')
  if (!user) throw new Error('Authenticated user is missing from request context')
  return user
}

export async function requireAuth(c: Context, next: Next) {
  const pathname = new URL(c.req.url).pathname
  if (isPublicApiPath(pathname)) {
    await next()
    return
  }

  const user = await findSessionUser(readBearerToken(c.req.header('Authorization')))
  if (!user) {
    return c.json({ code: 401, data: null, message: '未登录' }, 401)
  }

  ;(c as AuthContext).set('currentUser', user)
  await next()
}
