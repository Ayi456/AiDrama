import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTencentSmsPayload,
  createSmsCode,
  normalizeTencentSmsConfig,
  shouldExposeDevSmsCode,
} from '../auth/tencent-sms.js'

test('createSmsCode returns six numeric digits', () => {
  assert.match(createSmsCode(() => 0.123456), /^\d{6}$/)
})

test('normalizeTencentSmsConfig detects missing Tencent SMS credentials', () => {
  const config = normalizeTencentSmsConfig({})
  assert.equal(config.enabled, false)
  assert.deepEqual(config.missing, [
    'TENCENT_SECRET_ID',
    'TENCENT_SECRET_KEY',
    'TENCENT_SMS_SDK_APP_ID',
    'TENCENT_SMS_SIGN_NAME',
    'TENCENT_SMS_TEMPLATE_ID',
  ])
})

test('normalizeTencentSmsConfig accepts Drama-compatible SMS env aliases', () => {
  const config = normalizeTencentSmsConfig({
    TENCENT_SECRET_ID: 'sid',
    TENCENT_SECRET_KEY: 'skey',
    TENCENT_REGION: 'ap-shanghai',
    SMS_SDK_APP_ID: '1400000000',
    SMS_SIGN_NAME: 'AiDrama',
    SMS_TEMPLATE_ID: '12345',
  })

  assert.equal(config.enabled, true)
  assert.deepEqual(config.missing, [])
  assert.equal(config.region, 'ap-shanghai')
  assert.equal(config.sdkAppId, '1400000000')
  assert.equal(config.signName, 'AiDrama')
  assert.equal(config.templateId, '12345')
})

test('buildTencentSmsPayload formats Chinese mobile numbers for Tencent SMS', () => {
  const payload = buildTencentSmsPayload({
    phone: '13800138000',
    code: '123456',
    expireMinutes: 15,
    sdkAppId: '1400000000',
    signName: 'AiDrama',
    templateId: '12345',
  })

  assert.deepEqual(payload, {
    PhoneNumberSet: ['+8613800138000'],
    SmsSdkAppId: '1400000000',
    SignName: 'AiDrama',
    TemplateId: '12345',
    TemplateParamSet: ['123456', '15'],
  })
})

test('shouldExposeDevSmsCode only exposes codes outside production', () => {
  assert.equal(shouldExposeDevSmsCode('production'), false)
  assert.equal(shouldExposeDevSmsCode('development'), true)
  assert.equal(shouldExposeDevSmsCode(undefined), true)
})
