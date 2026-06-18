import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'

import { isPublicApiPath } from './auth-policy.js'
import { findSessionUser } from '../services/auth/session-service.js'
import { readSessionToken, SESSION_COOKIE_NAME } from '../services/auth/session-policy.js'

export { isPublicApiPath } from './auth-policy.js'

export type CurrentUser = {
  id: number
  username: string
  email: string
  phone: string
  status: string
}

type AuthContext = Context<{ Variables: { currentUser: CurrentUser } }>

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

  const token = readSessionToken({
    cookieToken: getCookie(c, SESSION_COOKIE_NAME),
  })
  const user = await findSessionUser(token)
  if (!user) {
    return c.json({ code: 401, data: null, message: '未登录' }, 401)
  }

  ;(c as AuthContext).set('currentUser', user)
  await next()
}
