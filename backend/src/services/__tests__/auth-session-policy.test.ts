import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  SESSION_TTL_SECONDS,
  buildSessionCookieOptions,
  readSessionToken,
  sessionExpiryFrom,
} from '../auth/session-policy.js'

test('session expiry is 14 days from creation time', () => {
  const base = Date.parse('2026-06-18T00:00:00.000Z')

  assert.equal(SESSION_TTL_DAYS, 14)
  assert.equal(sessionExpiryFrom(base), '2026-07-02T00:00:00.000Z')
})

test('session cookie is HttpOnly and lasts 14 days', () => {
  assert.equal(SESSION_COOKIE_NAME, 'aidrama_session')
  assert.equal(SESSION_TTL_SECONDS, 14 * 24 * 60 * 60)
  assert.deepEqual(buildSessionCookieOptions({ secure: false }), {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  })
})

test('readSessionToken only accepts the HttpOnly cookie token', () => {
  assert.equal(readSessionToken({ cookieToken: 'cookie-token' }), 'cookie-token')
  assert.equal(readSessionToken({ cookieToken: '' }), '')
  assert.equal(readSessionToken({ cookieToken: undefined }), '')
})
