import assert from 'node:assert/strict'

import {
  assertBillingPrice,
  assertRechargeAmount,
  multiplyMoney,
  toMoney,
} from '../billing/money.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('toMoney keeps yuan values at two decimal places with half-up rounding', () => {
  assert.equal(toMoney('0.105'), '0.11')
  assert.equal(toMoney('12'), '12.00')
})

runTest('money arithmetic avoids JavaScript floating point drift', () => {
  assert.equal(toMoney(multiplyMoney('0.10', '3')), '0.30')
  assert.equal(toMoney(multiplyMoney('1.20', '2.50')), '3.00')
})

runTest('assertRechargeAmount accepts flexible yuan input in the recharge range', () => {
  assert.equal(assertRechargeAmount('1'), '1.00')
  assert.equal(assertRechargeAmount('1.0'), '1.00')
  assert.equal(assertRechargeAmount('1.00'), '1.00')
  assert.equal(assertRechargeAmount('9999.00'), '9999.00')
  assert.throws(() => assertRechargeAmount('0.99'), /between 1.00 and 9999.00/)
  assert.throws(() => assertRechargeAmount('10000'), /between 1.00 and 9999.00/)
  assert.throws(() => assertRechargeAmount('1.234'), /up to two decimals/)
  assert.throws(() => assertRechargeAmount('abc'), /up to two decimals/)
})

runTest('assertBillingPrice accepts adjustable per-second prices without allowing zero', () => {
  assert.equal(assertBillingPrice('0.01'), '0.01')
  assert.equal(assertBillingPrice('999.99'), '999.99')
  assert.throws(() => assertBillingPrice('0.00'), /between 0.01 and 999.99/)
  assert.throws(() => assertBillingPrice('1.2'), /two decimal/)
})
