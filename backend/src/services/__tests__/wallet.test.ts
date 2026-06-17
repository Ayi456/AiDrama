import assert from 'node:assert/strict'

import {
  assertCanCoverVideoDuration,
  assertCanCoverNextSecond,
  calculateRechargeCredit,
  calculateVideoDebit,
  isInsufficientBalanceError,
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
