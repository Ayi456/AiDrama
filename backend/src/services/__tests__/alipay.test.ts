import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import { createAlipayPagePayForm } from '../payments/alipay.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function withEnv(values: Record<string, string>, fn: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key]
    process.env[key] = values[key]
  }

  try {
    fn()
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] == null) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

runTest('createAlipayPagePayForm signs with PKCS8 application private keys', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  withEnv({
    ALIPAY_APP_ID: '2021000000000000',
    ALIPAY_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    ALIPAY_PUBLIC_KEY: publicKey.replace(/\n/g, '\\n'),
    ALIPAY_GATEWAY: 'https://openapi.alipay.com/gateway.do',
  }, () => {
    const html = createAlipayPagePayForm({
      orderNo: 'RTEST',
      amount: '1.00',
      subject: 'AiDrama test',
      body: 'AiDrama test',
      returnUrl: 'http://localhost:5679/api/v1/payments/alipay/return',
      notifyUrl: 'http://localhost:5679/api/v1/payments/alipay/notify',
    })

    assert.match(html, /alipay\.trade\.page\.pay/)
    assert.match(html, /RTEST/)
  })
})
