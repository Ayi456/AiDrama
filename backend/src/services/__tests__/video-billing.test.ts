import assert from 'node:assert/strict'

import {
  buildBillingRequiredVideoPatch,
  calculateVideoBillingCharge,
} from '../billing/video-billing.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('calculateVideoBillingCharge bills only newly confirmed seconds', () => {
  assert.deepEqual(calculateVideoBillingCharge({
    billedSeconds: '3.50',
    confirmedTotalSeconds: '8.00',
    pricePerSecond: '1.00',
  }), {
    secondsDelta: '4.50',
    amount: '4.50',
    shouldCharge: true,
  })
})

runTest('calculateVideoBillingCharge is a no-op when confirmed seconds were already billed', () => {
  assert.deepEqual(calculateVideoBillingCharge({
    billedSeconds: '8.00',
    confirmedTotalSeconds: '8.00',
    pricePerSecond: '1.00',
  }), {
    secondsDelta: '0.00',
    amount: '0.00',
    shouldCharge: false,
  })
})

runTest('calculateVideoBillingCharge rounds yuan amount to two decimals', () => {
  assert.deepEqual(calculateVideoBillingCharge({
    billedSeconds: '0.00',
    confirmedTotalSeconds: '2.35',
    pricePerSecond: '1.20',
  }), {
    secondsDelta: '2.35',
    amount: '2.82',
    shouldCharge: true,
  })
})

runTest('buildBillingRequiredVideoPatch stores generated result without publishing it', () => {
  assert.deepEqual(buildBillingRequiredVideoPatch({
    publicUrl: 'https://cdn.example.com/video.mp4',
    localPath: 'static/videos/video.mp4',
    durationSeconds: '6.00',
    message: '余额不足，请充值后继续结算',
    updatedAt: '2026-06-17T02:30:00.000Z',
  }), {
    billingStatus: 'billing_required',
    billingError: '余额不足，请充值后继续结算',
    pendingVideoUrl: 'https://cdn.example.com/video.mp4',
    pendingLocalPath: 'static/videos/video.mp4',
    pendingDurationSeconds: '6.00',
    status: 'billing_required',
    updatedAt: '2026-06-17T02:30:00.000Z',
  })
})
