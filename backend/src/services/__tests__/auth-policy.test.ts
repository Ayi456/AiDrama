import test from 'node:test'
import assert from 'node:assert/strict'

import {
  readLoginPayload,
  readRegisterPayload,
  sanitizeAuthUser,
} from '../auth/auth-policy.js'

test('readRegisterPayload normalizes and accepts complete registration data', () => {
  const result = readRegisterPayload({
    username: '  StudioUser  ',
    email: ' USER@Example.COM ',
    phone: ' 13800138000 ',
    password: 'secret123',
    sms_code: ' 123456 ',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.data, {
    username: 'StudioUser',
    email: 'user@example.com',
    phone: '13800138000',
    password: 'secret123',
    smsCode: '123456',
  })
})

test('readRegisterPayload rejects invalid email, phone, password and sms code', () => {
  assert.deepEqual(readRegisterPayload({ username: 'ab', email: 'bad', phone: '100', password: '123', sms_code: '1' }), {
    ok: false,
    message: '请填写有效的注册信息',
    fields: {
      username: '用户名至少 3 个字符',
      email: '邮箱格式不正确',
      phone: '手机号格式不正确',
      password: '密码至少 6 个字符',
      smsCode: '验证码应为 6 位数字',
    },
  })
})

test('readLoginPayload accepts email or phone identifiers', () => {
  assert.deepEqual(readLoginPayload({ identifier: ' USER@Example.COM ', password: 'secret123' }), {
    ok: true,
    data: { identifier: 'user@example.com', password: 'secret123' },
  })

  assert.deepEqual(readLoginPayload({ identifier: ' 13800138000 ', password: 'secret123' }), {
    ok: true,
    data: { identifier: '13800138000', password: 'secret123' },
  })
})

test('sanitizeAuthUser excludes password and internal fields', () => {
  const user = sanitizeAuthUser({
    id: 9,
    username: 'StudioUser',
    email: 'user@example.com',
    phone: '13800138000',
    passwordHash: 'hash',
    status: 'active',
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    lastLoginAt: null,
  })

  assert.deepEqual(user, {
    id: 9,
    username: 'StudioUser',
    email: 'user@example.com',
    phone: '13800138000',
    status: 'active',
    createdAt: '2026-06-16T00:00:00.000Z',
    lastLoginAt: null,
  })
  assert.equal('passwordHash' in user, false)
  assert.equal('updatedAt' in user, false)
})
