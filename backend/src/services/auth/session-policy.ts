export const SESSION_TTL_DAYS = 14
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60
export const SESSION_COOKIE_NAME = 'aidrama_session'

export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'Lax' | 'None' | 'Strict'
  maxAge: number
  path: string
}

export function sessionExpiryFrom(nowMs = Date.now()) {
  return new Date(nowMs + SESSION_TTL_SECONDS * 1000).toISOString()
}

function envBoolean(value: string | undefined): boolean | null {
  if (value == null || value.trim() === '') return null
  if (/^(1|true|yes|on)$/i.test(value.trim())) return true
  if (/^(0|false|no|off)$/i.test(value.trim())) return false
  return null
}

export function shouldUseSecureSessionCookie(env: NodeJS.ProcessEnv = process.env) {
  return envBoolean(env.SESSION_COOKIE_SECURE)
    ?? envBoolean(env.COOKIE_SECURE)
    ?? env.NODE_ENV === 'production'
}

export function buildSessionCookieOptions(input: { secure?: boolean } = {}): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: input.secure ?? shouldUseSecureSessionCookie(),
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  }
}

export function readSessionToken(input: { cookieToken?: string | null }) {
  return String(input.cookieToken || '').trim()
}
