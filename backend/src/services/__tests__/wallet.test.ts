import assert from 'node:assert/strict'

import {
  assertCanCoverVideoDuration,
  assertCanCoverNextSecond,
  calculateRechargeCredit,
  calculateVideoDebit,
  isInsufficientBalanceError,
  mapWalletTransaction,
} from '../billing/wallet.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('calculateRechargeCredit increases balance and total recharged in yuan', () => {
  assert.deepEqual(calculateRechargeCredit({
    balance: '8.50',
    totalRecharged: '20.00',
    amount: '12.00',
  }), {
    balance: '20.50',
    totalRecharged: '32.00',
    transactionAmount: '12.00',
  })
})

runTest('calculateVideoDebit records negative transaction amount and total consumed', () => {
  assert.deepEqual(calculateVideoDebit({
    balance: '20.50',
    totalConsumed: '3.00',
    amount: '8.25',
  }), {
    balance: '12.25',
    totalConsumed: '11.25',
    transactionAmount: '-8.25',
  })
})

runTest('calculateVideoDebit refuses to make a wallet balance negative', () => {
  assert.throws(
    () => calculateVideoDebit({ balance: '2.00', totalConsumed: '0.00', amount: '2.01' }),
    (error) => isInsufficientBalanceError(error),
  )
})

runTest('assertCanCoverNextSecond checks only the next second instead of estimating total video cost', () => {
  assert.doesNotThrow(() => assertCanCoverNextSecond('1.00', '1.00'))
  assert.throws(
    () => assertCanCoverNextSecond('0.99', '1.00'),
    (error) => isInsufficientBalanceError(error),
  )
})

runTest('assertCanCoverVideoDuration requires enough balance for the requested video seconds', () => {
  assert.doesNotThrow(() => assertCanCoverVideoDuration('15.00', '1.00', 15))
  assert.throws(
    () => assertCanCoverVideoDuration('1.00', '1.00', 15),
    (error) => isInsufficientBalanceError(error),
  )
})

runTest('mapWalletTransaction includes linked video generation token usage', () => {
  assert.deepEqual(
    mapWalletTransaction({
      transaction_no: 'WV202606260001',
      user_id: 1,
      amount: '-5.00',
      balance_after: '15.00',
      type: 'video_charge',
      related_order_no: null,
      related_video_generation_id: 7,
      description: 'Video charge',
      created_at: '2026-06-26T10:00:00.000Z',
      video_task_id: 'task-1',
      video_provider: 'volcengine',
      video_model: 'doubao-seedance-2-0-260128',
      video_duration: 5,
      video_resolution: '720p',
      video_aspect_ratio: '9:16',
      provider_usage_completion_tokens: 108900,
      provider_usage_total_tokens: 108900,
      provider_usage_raw: '{"completion_tokens":108900,"total_tokens":108900}',
    } as any).videoUsage,
    {
      videoGenerationId: 7,
      taskId: 'task-1',
      provider: 'volcengine',
      model: 'doubao-seedance-2-0-260128',
      duration: 5,
      resolution: '720p',
      aspectRatio: '9:16',
      completionTokens: 108900,
      totalTokens: 108900,
      raw: { completion_tokens: 108900, total_tokens: 108900 },
    },
  )
})
