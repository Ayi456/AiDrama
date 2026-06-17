import assert from 'node:assert/strict'

import {
  readWalletListLimit,
  shouldExposePendingSettlement,
} from '../policies/wallet-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('readWalletListLimit defaults, clamps, and ignores invalid values', () => {
  assert.equal(readWalletListLimit(undefined), 20)
  assert.equal(readWalletListLimit('abc'), 20)
  assert.equal(readWalletListLimit('0'), 20)
  assert.equal(readWalletListLimit('5'), 5)
  assert.equal(readWalletListLimit('500'), 100)
})

runTest('pending settlement list includes in-flight unbilled video generations', () => {
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'unbilled', generationStatus: 'pending' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'unbilled', generationStatus: 'processing' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'unbilled', generationStatus: 'checking_defect' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'billing', generationStatus: 'completed' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'billing_required', generationStatus: 'billing_required' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'billing_failed', generationStatus: 'failed' }), true)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'unbilled', generationStatus: 'completed' }), false)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'settled', generationStatus: 'completed' }), false)
  assert.equal(shouldExposePendingSettlement({ billingStatus: 'unbilled', generationStatus: 'failed' }), false)
})
