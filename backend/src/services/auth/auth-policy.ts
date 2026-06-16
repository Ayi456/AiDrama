export type AuthUserRecord = {
  id: number
  username: string
  email: string
  phone: string
  passwordHash: string
  status: string
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export type AuthUser = {
  id: number
  username: string
  email: string
  phone: string
  status: string
  createdAt: string
  lastLoginAt: string | null
}

export type RegisterPayload = {
  username: string
  email: string
  phone: string
  password: string
  smsCode: string
}

export type LoginPayload = {
  identifier: string
  password: string
}

type InvalidPayload = {
  ok: false
  message: string
  fields: Record<string, string>
}

type ValidPayload<T> = {
  ok: true
  data: T
}

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidChinaPhone(value: string) {
  return /^1[3-9]\d{9}$/.test(value)
}

export function readRegisterPayload(input: Record<string, unknown>): ValidPayload<RegisterPayload> | InvalidPayload {
  const username = readString(input, 'username')
  const email = normalizeEmail(readString(input, 'email'))
  const phone = readString(input, 'phone')
  const password = readString(input, 'password')
  const smsCode = readString(input, 'sms_code') || readString(input, 'smsCode')
  const fields: Record<string, string> = {}

  if (username.length < 3) fields.username = '用户名至少 3 个字符'
  if (!isValidEmail(email)) fields.email = '邮箱格式不正确'
  if (!isValidChinaPhone(phone)) fields.phone = '手机号格式不正确'
  if (password.length < 6) fields.password = '密码至少 6 个字符'
  if (!/^\d{6}$/.test(smsCode)) fields.smsCode = '验证码应为 6 位数字'

  if (Object.keys(fields).length) {
    return { ok: false, message: '请填写有效的注册信息', fields }
  }

  return {
    ok: true,
    data: { username, email, phone, password, smsCode },
  }
}

export function readLoginPayload(input: Record<string, unknown>): ValidPayload<LoginPayload> | InvalidPayload {
  const rawIdentifier = readString(input, 'identifier') || readString(input, 'phone') || readString(input, 'email')
  const identifier = rawIdentifier.includes('@') ? normalizeEmail(rawIdentifier) : rawIdentifier
  const password = readString(input, 'password')
  const fields: Record<string, string> = {}

  if (!identifier || (!isValidEmail(identifier) && !isValidChinaPhone(identifier))) {
    fields.identifier = '请输入有效的邮箱或手机号'
  }
  if (!password) fields.password = '请输入密码'

  if (Object.keys(fields).length) {
    return { ok: false, message: '请填写有效的登录信息', fields }
  }

  return { ok: true, data: { identifier, password } }
}

export function sanitizeAuthUser(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}
