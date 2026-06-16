import { Hono } from 'hono'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { randomBytes } from 'node:crypto'

import { mysqlPool } from '../../db/index.js'
import { readJsonBody } from '../shared/route-body.js'
import { badRequest, created, now, success } from '../../utils/response.js'
import {
  type AuthUserRecord,
  readLoginPayload,
  readRegisterPayload,
  sanitizeAuthUser,
} from '../../services/auth/auth-policy.js'
import { hashPassword, verifyPassword } from '../../services/auth/password.js'
import {
  createSmsCode,
  createSmsCodeSalt,
  hashSmsCode,
  normalizeTencentSmsConfig,
  sendTencentSmsCode,
  shouldExposeDevSmsCode,
} from '../../services/auth/tencent-sms.js'

const app = new Hono()
const SESSION_TTL_DAYS = 7
const SMS_EXPIRE_MINUTES = 15

type UserRow = RowDataPacket & {
  id: number
  username: string
  email: string
  phone: string
  password_hash: string
  status: string
  created_at: string
  updated_at: string
  last_login_at: string | null
}

function mapUser(row: UserRow): AuthUserRecord {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  }
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

function smsExpiry() {
  return new Date(Date.now() + SMS_EXPIRE_MINUTES * 60 * 1000).toISOString()
}

function readBearerToken(headerValue: string | undefined) {
  const match = String(headerValue || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

async function createSession(userId: number) {
  const token = randomBytes(32).toString('hex')
  await mysqlPool.execute(
    'INSERT INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [token, userId, sessionExpiry(), now()],
  )
  return token
}

async function findUserByIdentifier(identifier: string) {
  const [rows] = await mysqlPool.execute<UserRow[]>(
    'SELECT * FROM users WHERE (email = ? OR phone = ?) AND status = "active" LIMIT 1',
    [identifier, identifier],
  )
  return rows[0] ? mapUser(rows[0]) : null
}

async function findSessionUser(token: string) {
  if (!token) return null
  const [rows] = await mysqlPool.execute<UserRow[]>(
    `SELECT u.*
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > ?
        AND u.status = "active"
      LIMIT 1`,
    [token, now()],
  )
  return rows[0] ? mapUser(rows[0]) : null
}

async function verifyRegisterCode(phone: string, code: string) {
  const [rows] = await mysqlPool.execute<(RowDataPacket & {
    id: number
    code_hash: string
    salt: string
    attempts: number
  })[]>(
    `SELECT id, code_hash, salt, attempts
       FROM sms_codes
      WHERE phone = ?
        AND purpose = "register"
        AND used_at IS NULL
        AND expires_at > ?
      ORDER BY id DESC
      LIMIT 1`,
    [phone, now()],
  )
  const row = rows[0]
  if (!row) return false
  const nextAttempts = Number(row.attempts || 0) + 1
  const expected = hashSmsCode(phone, code, row.salt)
  const ok = expected === row.code_hash

  if (ok) {
    await mysqlPool.execute('UPDATE sms_codes SET used_at = ?, attempts = ? WHERE id = ?', [now(), nextAttempts, row.id])
    return true
  }

  await mysqlPool.execute('UPDATE sms_codes SET attempts = ? WHERE id = ?', [nextAttempts, row.id])
  return false
}

app.post('/sms-code', async (c) => {
  const body = await readJsonBody(c)
  const phone = String(body.phone || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) return badRequest(c, '手机号格式不正确')

  const existing = await findUserByIdentifier(phone)
  if (existing) return badRequest(c, '该手机号已注册')

  const code = createSmsCode()
  const salt = createSmsCodeSalt()
  const ts = now()
  await mysqlPool.execute(
    `INSERT INTO sms_codes (phone, purpose, code_hash, salt, expires_at, created_at, attempts)
     VALUES (?, "register", ?, ?, ?, ?, 0)`,
    [phone, hashSmsCode(phone, code, salt), salt, smsExpiry(), ts],
  )

  const config = normalizeTencentSmsConfig()
  if (config.enabled) {
    const sent = await sendTencentSmsCode({
      config,
      phone,
      code,
      expireMinutes: SMS_EXPIRE_MINUTES,
      sdkAppId: config.sdkAppId,
      signName: config.signName,
      templateId: config.templateId,
    })
    if (!sent.ok) return c.json({ code: 502, message: sent.message }, 502)
  }

  return success(c, {
    message: config.enabled ? '验证码已发送' : '验证码已生成',
    dev_code: shouldExposeDevSmsCode() ? code : undefined,
    expires_in: SMS_EXPIRE_MINUTES * 60,
  })
})

app.post('/register', async (c) => {
  const parsed = readRegisterPayload(await readJsonBody(c))
  if (!parsed.ok) return c.json({ code: 400, message: parsed.message, fields: parsed.fields }, 400)

  const { username, email, phone, password, smsCode } = parsed.data
  const codeOk = await verifyRegisterCode(phone, smsCode)
  if (!codeOk) return badRequest(c, '验证码错误或已过期')

  const [duplicates] = await mysqlPool.execute<RowDataPacket[]>(
    'SELECT id, email, phone, username FROM users WHERE email = ? OR phone = ? OR username = ? LIMIT 1',
    [email, phone, username],
  )
  if (duplicates.length) return badRequest(c, '用户名、邮箱或手机号已注册')

  const ts = now()
  const passwordHash = await hashPassword(password)
  const [result] = await mysqlPool.execute<ResultSetHeader>(
    `INSERT INTO users (username, email, phone, password_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, "active", ?, ?)`,
    [username, email, phone, passwordHash, ts, ts],
  )
  const userId = Number(result.insertId)
  const token = await createSession(userId)
  const [rows] = await mysqlPool.execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId])
  return created(c, { token, user: sanitizeAuthUser(mapUser(rows[0])) })
})

app.post('/login', async (c) => {
  const parsed = readLoginPayload(await readJsonBody(c))
  if (!parsed.ok) return c.json({ code: 400, message: parsed.message, fields: parsed.fields }, 400)

  const user = await findUserByIdentifier(parsed.data.identifier)
  if (!user || !await verifyPassword(parsed.data.password, user.passwordHash)) {
    return c.json({ code: 401, message: '邮箱、手机号或密码不正确' }, 401)
  }

  await mysqlPool.execute('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now(), now(), user.id])
  const token = await createSession(user.id)
  const refreshed = await findUserByIdentifier(parsed.data.identifier)
  return success(c, { token, user: sanitizeAuthUser(refreshed || user) })
})

app.get('/session', async (c) => {
  const user = await findSessionUser(readBearerToken(c.req.header('Authorization')))
  if (!user) return c.json({ code: 401, message: '未登录' }, 401)
  return success(c, { user: sanitizeAuthUser(user) })
})

app.post('/logout', async (c) => {
  const token = readBearerToken(c.req.header('Authorization'))
  if (token) await mysqlPool.execute('DELETE FROM auth_sessions WHERE token = ?', [token])
  return success(c)
})

export default app
