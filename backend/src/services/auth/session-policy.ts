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

export type SessionCookieBuildInput = {
  secure?: boolean
  env?: NodeJS.ProcessEnv
  requestUrl?: string
  forwardedProto?: string | null
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

function readForwardedProto(value: string | null | undefined) {
  return String(value || '').split(',')[0].trim().toLowerCase()
}

function readRequestProtocol(requestUrl: string | undefined) {
  if (!requestUrl) return ''
  try {
    return new URL(requestUrl).protocol.toLowerCase()
  } catch {
    return ''
  }
}

export function shouldUseSecureSessionCookie(
  env: NodeJS.ProcessEnv = process.env,
  input: Pick<SessionCookieBuildInput, 'requestUrl' | 'forwardedProto'> = {},
) {
  const explicit = envBoolean(env.SESSION_COOKIE_SECURE) ?? envBoolean(env.COOKIE_SECURE)
  if (explicit !== null) return explicit

  const forwardedProto = readForwardedProto(input.forwardedProto)
  if (forwardedProto === 'https') return true
  if (forwardedProto === 'http') return false

  const requestProtocol = readRequestProtocol(input.requestUrl)
  if (requestProtocol === 'https:') return true
  if (requestProtocol === 'http:') return false

  return env.NODE_ENV === 'production'
}

export function buildSessionCookieOptions(input: SessionCookieBuildInput = {}): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: input.secure ?? shouldUseSecureSessionCookie(input.env, input),
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  }
}

export function readSessionToken(input: { cookieToken?: string | null }) {
  return String(input.cookieToken || '').trim()
}
