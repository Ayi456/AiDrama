import assert from 'node:assert/strict'

import { isPublicApiPath } from '../../middleware/auth-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('Alipay notify and return endpoints are public, while recharge order creation stays authenticated', () => {
  assert.equal(isPublicApiPath('/api/v1/payments/alipay/notify'), true)
  assert.equal(isPublicApiPath('/api/v1/payments/alipay/return'), true)
  assert.equal(isPublicApiPath('/api/v1/payments/recharge-orders'), false)
})
